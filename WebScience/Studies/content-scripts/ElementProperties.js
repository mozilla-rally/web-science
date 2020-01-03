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

const elemIsVisible = elem => {
    const rect = elem.getBoundingClientRect();
    const st = window.getComputedStyle(elem);
    let ret = (
        elem &&
        elem.offsetHeight > 0 &&
        elem.offsetWidth > 0 &&
        rect &&
        rect.height > 0 &&
        rect.width > 0 &&
        st &&
        st.display && st.display !== "none" &&
        st.opacity && st.opacity !== "0"
    );
    return ret;
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

/**
 * Helper function to get size of element
 * @param {Element} el element
 * 
 * @returns Object with width and height of element
 */
function getElementSize(el) {
    let rect = el.getBoundingClientRect();
    return {
        width: rect.width,
        height: rect.height
    };
}


/**
 * Get link size
 * @param {string} link url on the page
 * @returns {(size|null)} size of the element
 */
function getLinkSize(link) {
    // create an object with key = init and value is resolved url
    let query = "a[href='" + link + "']";
    let elements = document.body.querySelectorAll(query);
    return (elements.length > 0 ? getElementSize(elements[0]) : null);
}