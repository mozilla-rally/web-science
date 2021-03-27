// Assemble the webScience.utilities namespace

// Note that the order of module imports matters, since utility
// modules can depend on other utility modules

import * as contentScripts from "./utilities/contentScripts.js"
export { contentScripts }

import * as debugging from "./utilities/debugging.js"
export { debugging }

import * as events from "./utilities/events.js"
export { events }

import * as storage from "./utilities/storage.js"
export { storage }

import * as messaging from "./utilities/messaging.js"
export { messaging }

import * as idle from "./utilities/idle.js"
export { idle }

import * as matching from "./utilities/matching.js"
export { matching }

import * as scheduling from "./utilities/scheduling.js"
export { scheduling }

import * as pageManager from "./utilities/pageManager.js"
export { pageManager }

import * as linkResolution from "./utilities/linkResolution.js"
export { linkResolution }

import * as userSurvey from "./utilities/userSurvey.js"
export { userSurvey }

import * as socialMediaActivity from "./utilities/socialMediaActivity.js"
export { socialMediaActivity }

import * as dataAnalysis from "./utilities/dataAnalysis.js"
export { dataAnalysis }

import * as pageClassification from "./utilities/pageClassification.js"
export { pageClassification }
