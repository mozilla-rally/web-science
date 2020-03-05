/**
 * Functions defined over HTMLElement nodes
 * @module WebScience.Measurements.content-scripts.misc
 */

const isThresholdValid = threshold =>
    Number(threshold) === threshold && threshold >= 0 && threshold <= 1;

/**
 * @function
 * @param {Element} elem DOM element
 * @returns {Number[]} properties of element
 */
const properties = elem => {
    const rect = elem.getBoundingClientRect();
    const st = window.getComputedStyle(elem);
    return [elem, elem.offsetHeight, elem.offsetWidth, rect, rect.height, rect.width, st, st.display, st.opacity];
};


/**
* Helper function to test if DOM element is in viewport
* @param {Element} el check if {@link el} is in current viewport
*/
function isElementInViewport(el) {
    let rect = el.getBoundingClientRect();
    let st = window.getComputedStyle(el);
    return (
        rect.top >= 0 && // should this be strictly greater ? With >= invisible links have 0,0,0,0 in bounding rect
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}