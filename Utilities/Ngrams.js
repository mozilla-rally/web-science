var ngramExports = {};

// eslint-disable-next-line no-extra-semi
;(() => {
  'use strict';

  /**
   * @function _splitter
   * @private
   * @param {Array<string>} tokens array of strings
   * @param {number} n gram size
   * @param {boolean | Array<any>} pad add padding to start and end of output
   * @return {Array<Array<string>>} array of n-grams
   */
  const _splitter = (tokens, n, pad) => {
    const output = [];
    const padIsArray = Array.isArray(pad);
    if (pad === true || padIsArray) {
      let start = null;
      let end = null;
      if (padIsArray) {
        if (pad.length === 2) {
          start = pad[0];
          end = pad[1];
        } else if (pad.length === 1) {
          start = end = pad[0];
        } else {
          throw new Error(`Wrong number of elements in pad array. Expected 1 or 2, found ${pad.length}.`);
        }
      }
      for (let i = 1; i < n; i++) {
        if (start !== undefined) tokens.unshift(start);
        if (end !== undefined) tokens.push(end);
      }
    }
    const len = tokens.length - (n + 1);
    for (let i = 0; i < len; i++) {
      const grams = [];
      for (let j = 0; j < n; j++) {
        grams.push(tokens[i + n + (j - n)]);
      }
      output.push(grams);
    }
    return output;
  };

  /**
   * @function _validateInput
   * @private
   * @param {string | Array<string>} input
   * @return {boolean}
   */
  const _validateInput = (input) => {
    if (
      !input ||
      (!Array.isArray(input) && typeof input !== 'string') ||
      (typeof input === 'string' && !input.trim()) ||
      (Array.isArray(input) && input.length === 0) ||
      (Array.isArray(input) && (input.filter((x) => typeof x !== 'string').length > 0))
    ) {
      return false;
    } else {
      return true;
    }
  };

  /**
   * @function fromSync
   * @public
   * @param {string | Array<string>} input non-empty string or array of strings
   * @param {number} [n=2] gram size - defaults to bigrams (n=2)
   * @param {boolean | Array<any>} [pad] pad start and end of output?
   * @param {string | RegExp} [splitPattern] pattern used to split strings into tokens - defaults to spaces
   * @return {Array<Array<string>>}
   */
  const fromSync = (input, n = 2, pad = false, splitPattern = ' ') => {
    if (!_validateInput(input)) {
      throw new TypeError(`No valid input found. Expected non-empty string or array of non-empty string, found ${typeof input}.`);
    } else {
      let tokens;
      if (typeof input === 'string') {
        tokens = input.split(splitPattern);
      } else {
        tokens = input;
      }
      if (n > tokens.length && pad === false) {
        return [[...tokens]];
      } else {
        return _splitter(tokens, n, pad);
      }
    }
  };

  /**
   * @function from
   * @public
   * @async
   * @param {string | Array<string>} input non-empty string or array of strings
   * @param {number} [n=2] gram size - defaults to bigrams (n=2)
   * @param {boolean | Array<any>} [pad] pad start and end of output?
   * @param {string | RegExp} [splitPattern] pattern used to split strings into tokens - defaults to spaces
   * @return {Promise<Array<Array<string>>>}
   */
  const from = async (input, n = 2, pad = false, splitPattern = ' ') => {
    return fromSync(input, n, pad, splitPattern);
  };

  // export!
  if (Object.keys(ngramExports).length === 0 && ngramExports.constructor === Object){
    ngramExports.from = from;
    ngramExports.fromSync = fromSync;
  }
})();