'use strict';

var domClasses = require('min-dom').classes,
    domify = require('min-dom').domify,
    domQuery = require('min-dom').query;

var assign = require('min-dash').assign,
    forEach = require('min-dash').forEach,
    debounce = require('min-dash').debounce;

var escapeHTML = require('../Utils').escapeHTML;

var entryFieldDescription = require('./EntryFieldDescription');

var CLASS_ACTIVE = 'active';

var FOCUS_LEAVE_DELAY = '150';

var TEXT_NODE_NAME = '#text';

var SUGGESTION_LIST_BOX_THRESHOLD = 15;

var noop = function() {};


var autoSuggestTextBox = function(options, defaultParameters) {

  var resource = defaultParameters,
      label = options.label || resource.id,
      canBeShown = !!options.show && typeof options.show === 'function',
      description = options.description;

  resource.html =
    '<label ' +
      'for="camunda-' + escapeHTML(resource.id) + '" ' +
      (canBeShown ? 'data-show="isShown"' : '') +
      '>' + label + '</label>' +
    '<div class="bpp-field-wrapper" ' +
      (canBeShown ? 'data-show="isShown"' : '') +
    '>' +
      '<div ' +
        'contenteditable="true"' +
        'id="camunda-' + escapeHTML(resource.id) + '" ' +
        'name="' + escapeHTML(options.modelProperty) + '" ' +
        'data-auto-suggest="suggestItems"' +
        'data-blur="handleFocusLeave"' +
      '></div>' +
      '<div class="bpp-autosuggest-list"></div>' +
  '</div>';

  // add description below text box entry field
  if (description) {
    resource.html += entryFieldDescription(description);
  }

  if (canBeShown) {
    resource.isShown = function() {
      return options.show.apply(resource, arguments);
    };
  }

  /**
   * Ensure selected item got recognized before list got hidden
   */
  resource.handleFocusLeave = debounce(function(element, entryNode) {
    hideSuggestionList(entryNode);
  }, FOCUS_LEAVE_DELAY);

  /**
   * Fill the suggestion list relative to the current word under the cursor.
   *
   * @param {djs.model.Base} element
   * @param {HTMLElement} entryNode
   * @param {Event} event
   */
  resource.suggestItems = function(element, entryNode, event) {
    var editorNode = event.delegateTarget,
        range = getSelectionRange(),
        focusNode = range.focusNode,
        caretPosition = getCaretPosition(range.range),
        canSuggest = options.canSuggest || noop,
        getItems = options.getItems;

    var currentWord = (getWordUnderCursor(focusNode, caretPosition) || []);

    function updateSuggestionList(items) {
      var listNode = domQuery('.bpp-autosuggest-list', entryNode);

      // (1) clear list before
      while (listNode.firstChild) {
        listNode.removeChild(listNode.firstChild);
      }

      // (2) set list invisible if no items
      if (!items.length) {
        return hideSuggestionList(entryNode);
      }

      domClasses(listNode).add(CLASS_ACTIVE);

      // (3) create new items
      forEach(items, function(item) {
        createSuggestionItem(listNode, item);
      });

      // (4) place list relative to cursor
      var position = getSuggestionListPosition(listNode);
      setPosition(listNode, position.x, position.y);
    }

    function createSuggestionItem(parentNode, value) {
      var itemNode = domify('<div class="bpp-autosuggest-item"></div>');
      itemNode.innerText = value;

      parentNode.appendChild(itemNode);

      itemNode.addEventListener('click', handleItemClick);
    }

    function handleItemClick(event) {
      var value = event.target.innerText,
          wordIndex = currentWord.index,
          start = wordIndex,
          end = wordIndex + currentWord[0].length;

      selectRange(focusNode, start, end);

      document.execCommand('insertText', false, value);

      hideSuggestionList(entryNode);
    }


    if (currentWord && canSuggest(currentWord, editorNode, focusNode)) {
      var items = getItems(element, entryNode),
          results = [];

      items.forEach(function(item) {

        // searches current word inside list of available items
        if (item.indexOf(currentWord[0]) !== -1) {
          results.push(item);
        }
      });

      updateSuggestionList(results);
    }
  };


  resource.cssClasses = ['bpp-autosuggest-textbox'];

  return resource;
};

module.exports = autoSuggestTextBox;


// helpers /////////////////////////////

function getSelectionRange() {
  var selection = document.getSelection();

  return {
    range: selection.getRangeAt(0),
    focusNode: selection.focusNode
  };
}

function getCaretPosition(range) {
  return range.startOffset - 1;
}

/**
 * Calculates the position coordinates of the suggestion list,
 * dependant on position of cursor
 *
 * @return {Object} coordinates
 */
function getSuggestionListPosition(listNode) {
  var range = getSelectionRange().range,
      cursorBounds = range.getBoundingClientRect(),
      clientBounds = document.body.getBoundingClientRect(),
      listBounds = listNode.getBoundingClientRect();

  var coordinates = {
    'top-left': {
      x: cursorBounds.right - listBounds.width,
      y: cursorBounds.top - listBounds.height
    },
    'top-right': {
      x: cursorBounds.right,
      y: cursorBounds.top - listBounds.height
    },
    'bottom-left': {
      x: cursorBounds.right - listBounds.width,
      y: cursorBounds.top + SUGGESTION_LIST_BOX_THRESHOLD
    },
    'bottom-right': {
      x: cursorBounds.right,
      y: cursorBounds.top + SUGGESTION_LIST_BOX_THRESHOLD
    }
  };

  var orientation = '';

  if (cursorBounds.top + SUGGESTION_LIST_BOX_THRESHOLD + listBounds.height > clientBounds.height) {
    orientation = 'top-';
  } else {
    orientation = 'bottom-';
  }

  if (cursorBounds.right + listBounds.width > clientBounds.width) {
    orientation += 'left';
  } else {
    orientation += 'right';
  }

  return coordinates[orientation];
}

function selectRange(focusNode, start, end) {
  var range = document.createRange(),
      selection = window.getSelection();

  range.setStart(focusNode, start);
  range.setEnd(focusNode, end);

  selection.removeAllRanges();

  selection.addRange(range);
}

function hideSuggestionList(entryNode) {
  var listNode = domQuery('.bpp-autosuggest-list', entryNode);
  domClasses(listNode).remove(CLASS_ACTIVE);
}

function getWordUnderCursor(node, currentCursorPositon) {
  var value = node.nodeName === TEXT_NODE_NAME ? node.wholeText : node.innerText,
      allWords = findWords(value);

  return allWords.find(function(word) {
    var index = word.index,
        matchValue = word[0];

    return (
      index <= currentCursorPositon &&
      index + matchValue.length - 1 >= currentCursorPositon
    );
  });
}

/**
 * Retrieves all words inside a text (also inside clauses)
 *
 * @param {string} value
 *
 * @return {Array<Object>}
 */
function findWords(value) {

  // eslint-disable-next-line no-useless-escape
  return Array.from(value.matchAll(/[^\s\r\(\)\{}]+/g));
}

function setPosition(el, x, y) {
  assign(el.style, { left: x + 'px', top: y + 'px' });
}
