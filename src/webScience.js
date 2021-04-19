// Assemble the webScience namespace by re-exporting modules.
// Note that the order of modules matters. When adding a new
// module, it should come after dependencies.

import * as inline from "./inline.js"
export { inline }

import * as debugging from "./debugging.js"
export { debugging }

import * as permissions from "./permissions.js"
export { permissions }

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

import * as pageText from "./pageText.js"
export { pageText }

import * as pageNavigation from "./pageNavigation.js"
export { pageNavigation }

import * as linkExposure from "./linkExposure.js"
export { linkExposure }

import * as socialMediaLinkSharing from "./socialMediaLinkSharing.js"
export { socialMediaLinkSharing }

import * as randomization from "./randomization.js"
export { randomization }

import * as workers from "./workers.js"
export { workers }
