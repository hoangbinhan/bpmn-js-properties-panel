'use strict';

var getBusinessObject = require('bpmn-js/lib/util/ModelUtil').getBusinessObject,
    getExtensionElements = require('../../../helper/ExtensionElementsHelper').getExtensionElements,
    removeEntry = require('../../../helper/ExtensionElementsHelper').removeEntry,
    extensionElements = require('./implementation/ExtensionElements'),
    properties = require('./implementation/Properties'),
    entryFactory = require('../../../factory/EntryFactory'),
    elementHelper = require('../../../helper/ElementHelper'),
    cmdHelper = require('../../../helper/CmdHelper'),
    formHelper = require('../../../helper/FormHelper'),
    utils = require('../../../Utils'),
    is = require('bpmn-js/lib/util/ModelUtil').is,
    find = require('lodash/find'),
    each = require('lodash/forEach');
let typeString = ''
function generateValueId() {
  return utils.nextId('Value_');
}

/**
 * Generate a form field specific textField using entryFactory.
 *
 * @param  {string} options.id
 * @param  {string} options.label
 * @param  {string} options.modelProperty
 * @param  {function} options.validate
 *
 * @return {Object} an entryFactory.textField object
 */
function formFieldTextField(options, getSelectedFormField) {

  var id = options.id,
      label = options.label,
      modelProperty = options.modelProperty,
      validate = options.validate,
      typeString = options.typeString;
 

  return entryFactory.textField({
    id: id,
    label: label,
    modelProperty: modelProperty,
    typeString:typeString,
    get: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node) || {},
          values = {};
      if(modelProperty==='label'){
        const regex = /(\[type=(.{3,10})])*(.*)/g;
        let m;
        let str = selectedFormField[modelProperty]
        if ((m = regex.exec(str)) !== null) {
          m.forEach((match, groupIndex) => {
            if(groupIndex == 3){
              if(match!=='undefined'){
                values[modelProperty] = match
              }
              else{
                values[modelProperty] = selectedFormField[modelProperty];
              }
            }
          });
        }
      }
      else{
        values[modelProperty] = selectedFormField[modelProperty];
      }

      return values;
    },

    set: function(element, values, node) {
      var commands = [];
      if (typeof options.set === 'function') {
        var cmd = options.set(element, values, node);
        if (cmd) {
          commands.push(cmd);
        }
      }

      var formField = getSelectedFormField(element, node),
          properties = {};
      if(modelProperty==='label'){
      } 
      properties[modelProperty] = values[modelProperty] || undefined;
      
      commands.push(cmdHelper.updateBusinessObject(element, formField, properties));
      return commands;
    },
    hidden: function(element, node) {
      return !getSelectedFormField(element, node);
    },
    validate: validate
  });
}

function ensureFormKeyAndDataSupported(element) {
  return (
    is(element, 'bpmn:StartEvent') && !is(element.parent, 'bpmn:SubProcess')
  ) || is(element, 'bpmn:UserTask');
}

module.exports = function(group, element, bpmnFactory, translate) {

  if (!ensureFormKeyAndDataSupported(element)) {
    return;
  }


  /**
   * Return the currently selected form field querying the form field select box
   * from the DOM.
   *
   * @param  {djs.model.Base} element
   * @param  {DOMElement} node - DOM element of any form field text input
   *
   * @return {ModdleElement} the currently selected form field
   */
  function getSelectedFormField(element, node) {
    var selected = formFieldsEntry.getSelected(element, node.parentNode);

    if (selected.idx === -1) {
      return;
    }

    return formHelper.getFormField(element, selected.idx);
  }

  // [FormKey] form key text input field
  group.entries.push(entryFactory.textField({
    id : 'form-key',
    label : translate('Form Key'),
    modelProperty: 'formKey',
    get: function(element, node) {
      var bo = getBusinessObject(element);

      return {
        formKey: bo.get('camunda:formKey')
      };
    },
    set: function(element, values, node) {
      var bo = getBusinessObject(element),
          formKey = values.formKey || undefined;

      return cmdHelper.updateBusinessObject(element, bo, { 'camunda:formKey': formKey });
    }
  }));

  // [FormData] form field select box
  var formFieldsEntry = extensionElements(element, bpmnFactory, {
    id: 'form-fields',
    label: translate('Form Fields'),
    modelProperty: 'id',
    prefix: 'FormField',
    createExtensionElement: function(element, extensionElements, value) {
      var bo = getBusinessObject(element), commands = [];
      if (!extensionElements) {
        extensionElements = elementHelper.createElement('bpmn:ExtensionElements', { values: [] }, bo, bpmnFactory);
        commands.push(cmdHelper.updateProperties(element, { extensionElements: extensionElements }));
      }

      var formData = formHelper.getFormData(element);

      if (!formData) {
        formData = elementHelper.createElement('camunda:FormData', { fields: [] }, extensionElements, bpmnFactory);
        commands.push(cmdHelper.addAndRemoveElementsFromList(
          element,
          extensionElements,
          'values',
          'extensionElements',
          [formData],
          []
        ));
      }

      var field = elementHelper.createElement('camunda:FormField', { id: value }, formData, bpmnFactory);
      if (typeof formData.fields !== 'undefined') {
        commands.push(cmdHelper.addElementsTolist(element, formData, 'fields', [ field ]));
      } else {
        commands.push(cmdHelper.updateBusinessObject(element, formData, {
          fields: [ field ]
        }));
      }
      return commands;
    },
    removeExtensionElement: function(element, extensionElements, value, idx) {
      var formData = getExtensionElements(getBusinessObject(element), 'camunda:FormData')[0],
          entry = formData.fields[idx],
          commands = [];

      if (formData.fields.length < 2) {
        commands.push(removeEntry(getBusinessObject(element), element, formData));
      } else {
        commands.push(cmdHelper.removeElementsFromList(element, formData, 'fields', null, [entry]));
        if (entry.id === formData.get('businessKey')) {
          commands.push(cmdHelper.updateBusinessObject(element, formData, { 'businessKey': undefined }));
        }
      }

      return commands;
    },
    getExtensionElements: function(element) {
      return formHelper.getFormFields(element);
    },
    hideExtensionElements: function(element, node) {
      return false;
    }
  });
  group.entries.push(formFieldsEntry);

  // [FormData] business key form field select box
  var formBusinessKeyFormFieldEntry = entryFactory.selectBox({
    id: 'form-business-key',
    label: translate('Business Key'),
    modelProperty: 'businessKey',
    selectOptions: function(element, inputNode) {
      var selectOptions = [{ name: '', value: '' }];
      var formFields = formHelper.getFormFields(element);
      each(formFields, function(field) {
        if (field.type !== 'boolean') {
          selectOptions.push({ name: field.id, value: field.id });
        }
      });
      return selectOptions;
    },
    get: function(element, node) {
      var result = { businessKey: '' };
      var bo = getBusinessObject(element);
      var formDataExtension = getExtensionElements(bo, 'camunda:FormData');
      if (formDataExtension) {
        var formData = formDataExtension[0];
        var storedValue = formData.get('businessKey');
        result = { businessKey: storedValue };
      }
      return result;
    },
    set: function(element, values, node) {
      var formData = getExtensionElements(getBusinessObject(element), 'camunda:FormData')[0];
      return cmdHelper.updateBusinessObject(element, formData, { 'businessKey': values.businessKey || undefined });
    },
    hidden: function(element, node) {
      var isStartEvent = is(element,'bpmn:StartEvent');
      return !(isStartEvent && formHelper.getFormFields(element).length > 0);
    }
  });
  group.entries.push(formBusinessKeyFormFieldEntry);

  // [FormData] Form Field label
  group.entries.push(entryFactory.label({
    id: 'form-field-header',
    labelText: translate('Form Field'),
    showLabel: function(element, node) {
      return !!getSelectedFormField(element, node);
    }
  }));

  // [FormData] form field id text input field
  group.entries.push(entryFactory.validationAwareTextField({
    id: 'form-field-id',
    label: translate('ID'),
    modelProperty: 'id',

    getProperty: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node) || {};

      return selectedFormField.id;
    },

    setProperty: function(element, properties, node) {
      var formField = getSelectedFormField(element, node);

      return cmdHelper.updateBusinessObject(element, formField, properties);
    },

    hidden: function(element, node) {
      return !getSelectedFormField(element, node);
    },

    validate: function(element, values, node) {

      var formField = getSelectedFormField(element, node);

      if (formField) {

        var idValue = values.id;

        if (!idValue || idValue.trim() === '') {
          return { id: 'Form field id must not be empty' };
        }

        var formFields = formHelper.getFormFields(element);

        var existingFormField = find(formFields, function(f) {
          return f !== formField && f.id === idValue;
        });

        if (existingFormField) {
          return { id: 'Form field id already used in form data.' };
        }
      }
    }
  }));

  // [FormData] form field type combo box
  group.entries.push(entryFactory.comboBox({
    id: 'form-field-type',
    label: translate('Type'),
    selectOptions: [
      { name: 'string', value: 'string' },
      { name: 'long', value: 'long' },
      { name: 'boolean', value: 'boolean' },
      { name: 'date', value: 'date' },
      { name: 'enum', value: 'enum' },
    ],
    modelProperty: 'type',
    emptyParameter: true,
    get: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node);
      if (selectedFormField) {
        return { type: selectedFormField.type };
      } else {
        return {};
      }
    },
    set: function(element, values, node) {
      var selectedFormField = getSelectedFormField(element, node),
      // formData = getExtensionElements(getBusinessObject(element), 'camunda:FormData')[0],
          formData = getExtensionElements(getBusinessObject(element), 'camunda:FormData')[0],
          commands = [];

      if (selectedFormField.type === 'enum' && values.type !== 'enum') {
        // delete camunda:value objects from formField.values when switching from type enum
        commands.push(cmdHelper.updateBusinessObject(element, selectedFormField, { values: undefined }));
      }
     
      if (values.type === 'boolean' && selectedFormField.get('id') === formData.get('businessKey')) {
        commands.push(cmdHelper.updateBusinessObject(element, formData, { 'businessKey': undefined }));
      }

      if(values.type ==='string'){
        var selectedFormField = getSelectedFormField(element, node)
        var id = 'string_type'
        
        let properties = elementHelper.createElement('camunda:Properties', {}, getBusinessObject(element), bpmnFactory);
        commands.push(cmdHelper.addElementsTolist(element, selectedFormField, 'values', [properties]))
        
        let propertyProps = {
          id: id,
          value: 'input'
        }
        var property = elementHelper.createElement('camunda:Property', propertyProps, properties, bpmnFactory);
        commands.push(cmdHelper.addElementsTolist(element, properties, 'values', [ property ]));
      }
      else{
        var selectedFormField = getSelectedFormField(element, node)
        if(selectedFormField.values){
          commands.push(cmdHelper.removeElementsFromList(element, selectedFormField, 'values', null, [selectedFormField.values[0]]))
        }
        else{
          selectedFormField.properties = null
          // commands.push(cmdHelper.removeElementsFromList(element, selectedFormField, 'values', null, [selectedFormField.properties.values[0]]))
        }
      }
      commands.push(cmdHelper.updateBusinessObject(element, selectedFormField, values));
      return commands;
    },
    hidden: function(element, node) {
      return !getSelectedFormField(element, node);
    }
  }));

  //custom string

  // [FormData] form field string values table
  group.entries.push(entryFactory.comboBox({
    id: 'form-field-string-values',
    label: translate('String Type'),
    selectOptions: [
      { name: 'input', value: 'input' },
      { name: 'text area', value: 'textarea' },
      { name: 'email', value: 'email' },
      { name: 'password', value: 'password' },
    ],
    modelProperty: 'type',
    emptyParameter: false,
    get: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node);
      if (selectedFormField) {
        return { type: selectedFormField.type};
      } else {
        return {};
      }
    },

    set: function(element, values, node) {
      var selectedFormField = getSelectedFormField(element, node);
      var id = 'string_type'
      let propertyProps = {
        id: id,
        value: values.type
      }
      if(selectedFormField.values){
        var currentType = selectedFormField.values[0].values[0];
        console.log('currentType', currentType)
        return cmdHelper.updateBusinessObject(element, currentType, propertyProps);
      }
      else{
        console.log('selectedFormField.values', selectedFormField)
      }
    },
    
    hidden: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node);
      if(selectedFormField && selectedFormField.type === 'string'){
        let selectTypeString = document.getElementById("camunda-form-field-string-values-select");    
        selectTypeString.removeAttribute("data-value") ;
        if(selectedFormField.properties){
          let value = selectedFormField.properties.values[0].value
          let index = -1
          for(let i=0;i<selectTypeString.options.length;i++){
            let temp = selectTypeString.options[i].getAttribute('value')
            if(temp===value){
              index = i;
              break;
            }
          }
          if(index!==-1){
            var att = document.createAttribute("selected");   
            selectTypeString.options[index].setAttributeNode(att);
          }
        }
        else{
          var att = document.createAttribute("selected");   
          selectTypeString.options[0].setAttributeNode(att);
        }
      }
      return !(selectedFormField && selectedFormField.type === 'string')
    }
  }, getSelectedFormField));

  //custom stirng

  // [FormData] form field label text input field
  group.entries.push(formFieldTextField({
    id: 'form-field-label',
    label: translate('Label'),
    modelProperty: 'label',
    typeString: '{type}'
  }, getSelectedFormField));

  // [FormData] form field defaultValue text input field
  group.entries.push(formFieldTextField({
    id: 'form-field-defaultValue',
    label: translate('Default Value'),
    modelProperty: 'defaultValue'
  }, getSelectedFormField));


  // [FormData] form field enum values label
  group.entries.push(entryFactory.label({
    id: 'form-field-enum-values-header',
    labelText: translate('Values'),
    divider: true,
    showLabel: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node);

      return selectedFormField && selectedFormField.type === 'enum';
    }
  }));

  // [FormData] form field enum values table
  group.entries.push(entryFactory.table({
    id: 'form-field-enum-values',
    labels: [ translate('Id'), translate('Name') ],
    modelProperties: [ 'id', 'name' ],
    show: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node);

      return selectedFormField && selectedFormField.type === 'enum';
    },
    getElements: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node);

      return formHelper.getEnumValues(selectedFormField);
    },
    addElement: function(element, node) {
      var selectedFormField = getSelectedFormField(element, node),
          id = generateValueId();

      var enumValue = elementHelper.createElement(
        'camunda:Value',
        { id: id, name: undefined },
        getBusinessObject(element),
        bpmnFactory
      );

      return cmdHelper.addElementsTolist(element, selectedFormField, 'values', [enumValue]);
    },
    removeElement: function(element, node, idx) {
      var selectedFormField = getSelectedFormField(element, node),
          enumValue = selectedFormField.values[idx];

      return cmdHelper.removeElementsFromList(element, selectedFormField, 'values', null, [enumValue]);
    },
    updateElement: function(element, value, node, idx) {
      var selectedFormField = getSelectedFormField(element, node),
          enumValue = selectedFormField.values[idx];

      value.name = value.name || undefined;

      return cmdHelper.updateBusinessObject(element, enumValue, value);
    },
    validate: function(element, value, node, idx) {

      var selectedFormField = getSelectedFormField(element, node),
          enumValue = selectedFormField.values[idx];

      if (enumValue) {
        // check if id is valid
        var validationError = utils.isIdValid(enumValue, value.id);

        if (validationError) {
          return { id: validationError };
        }
      }
    }
  }));

  //--Custom String type
  // [FormData] form field enum values label
  // group.entries.push(entryFactory.label({
  //   id: 'form-field-enum-values-header',
  //   labelText: translate('Values'),
  //   divider: true,
  //   showLabel: function(element, node) {
  //     var selectedFormField = getSelectedFormField(element, node);

  //     return selectedFormField && selectedFormField.type === 'string';
  //   }
  // }));

 
  //--Custom String type

  // [FormData] Properties label
  // group.entries.push(entryFactory.label({
  //   id: 'form-field-properties-header',
  //   labelText: translate('Properties'),
  //   divider: true,
  //   showLabel: function(element, node) {
  //     return !!getSelectedFormField(element, node);
  //   }
  // }));

  // [FormData] camunda:properties table
  group.entries.push(properties(element, bpmnFactory, {
    id: 'form-field-properties',
    modelProperties: [ 'id', 'value' ],
    labels: [ translate('Id'), translate('Value') ],
    getParent: function(element, node) {
      return getSelectedFormField(element, node);
    },
    show: function(element, node) {
      return !!getSelectedFormField(element, node);
    },
  }, translate));

};
