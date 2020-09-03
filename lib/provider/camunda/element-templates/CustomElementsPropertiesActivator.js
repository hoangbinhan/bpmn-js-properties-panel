'use strict';

var inherits = require('inherits');

var getTemplate = require('./Helper').getTemplate;

var PropertiesActivator = require('../../../PropertiesActivator');

var HIGHER_PRIORITY = 1100;

/**
 * Applies template visibility settings.
 *
 * Controlled using `entriesVisible` on template config object:
 *
 * ```json
 *     "entriesVisible": {
 *       "_all": true|false,
 *       "entryName": true|false,
 *       ...
 *     }
 * ```
 *
 * @param {EventBus} eventBus
 * @param {ElementTemplates} elementTemplates
 */
function CustomElementsPropertiesActivator(eventBus, elementTemplates) {
  PropertiesActivator.call(this, eventBus, HIGHER_PRIORITY);

  this.isEntryVisible = function(element, entry, group, tab) {
    var template = getTemplate(element, elementTemplates);

    return isEntryVisible(element, entry, group, tab, template);
  };

  this.isPropertyEditable = function(propertyName, element, entry, group, tab) {

    var template = getTemplate(element, elementTemplates);

    if (template && !isEntryEditable(propertyName, element, entry, group, tab, template)) {
      return false;
    }
  };
}

CustomElementsPropertiesActivator.$inject = [ 'eventBus', 'elementTemplates' ];

inherits(CustomElementsPropertiesActivator, PropertiesActivator);

module.exports = CustomElementsPropertiesActivator;



// helpers ////////////////////////////////////


var CUSTOM_PROPERTIES_PATTERN = /^custom-/;

function isCustomEntry(entry) {
  return CUSTOM_PROPERTIES_PATTERN.test(entry.id);
}

function isEntryVisible(element, entry, group, tab, template) {
  if (template) {
    return tab.id === 'element-template';
  } else {
    return tab.id !== 'element-template';
  }
}

function isEntryEditable(propertyName, element, entry, group, tab, template) {

  var property;

  if (isCustomEntry(entry)) {
    property = getProperty(template, entry);

    return property && property.editable !== false;
  }

  return true;
}

function getProperty(template, entry) {

  var index;
  var idx = entry.id.replace('custom-' + template.id + '-', '');
  if (idx.indexOf('-') !== -1) {
    var indexes = idx.split('-');
    if (indexes.length == 2) {
      var scopeName = indexes[0].replace(/_/g, ':');
      index = parseInt(indexes[1], 10);
      if (scopeName && !isNaN(index)) {
        return template.scopes[scopeName].properties[index];
      }
    }
  } else {
    index = parseInt(idx, 10);
    if (!isNaN(index)) {
      return template.properties[index];
    }
  }

  throw new Error('cannot extract property index for entry <' + entry.id + '>');
}
