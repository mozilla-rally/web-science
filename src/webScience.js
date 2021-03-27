// Assemble the webScience namespace

// Note that the order of module imports matters, since the study
// modules depend on the utility modules

import * as utilities from "./webScience.utilities.js"
export { utilities }

import * as measurements from "./webScience.measurements.js"
export { measurements }
