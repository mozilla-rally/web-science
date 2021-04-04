// Assemble the webScience namespace

// Note that the order of module imports matters, since the study
// modules depend on the utility modules

import * as contentScripts from "./contentScripts.js"
export { contentScripts }

import * as debugging from "./debugging.js"
export { debugging }

import * as events from "./events.js"
export { events }

import * as id from "./id.js"
export { id }

import * as storage from "./storage.js"
export { storage }

import * as messaging from "./messaging.js"
export { messaging }

import * as idle from "./idle.js"
export { idle }

import * as matching from "./matching.js"
export { matching }

import * as scheduling from "./scheduling.js"
export { scheduling }

import * as pageManager from "./pageManager.js"
export { pageManager }

import * as linkResolution from "./linkResolution.js"
export { linkResolution }

import * as userSurvey from "./userSurvey.js"
export { userSurvey }

import * as socialMediaActivity from "./socialMediaActivity.js"
export { socialMediaActivity }

import * as pageClassification from "./pageClassification.js"
export { pageClassification }

import * as pageNavigation from "./pageNavigation.js"
export { pageNavigation }

import * as linkExposure from "./linkExposure.js"
export { linkExposure }

import * as socialMediaLinkSharing from "./socialMediaLinkSharing.js"
export { socialMediaLinkSharing }

import * as randomization from "./randomization.js"
export { randomization }
