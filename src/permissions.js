/**
 * This module facilitates checking that required permissions are
 * provided in the WebExtensions manifest.
 * 
 * @module permissions
 */

import * as matching from "./matching.js";

/**
 * An object where keys are Content Security Policy directive names and values are arrays of directive values.
 * @typedef {Object} ContentSecurityPolicy
 * @example
 * {
 *   "script-src": [ "'self'", "www.example.com" ],
 *   "object-src": [ 'self' ]
 * }
 */

/**
 * The Content Security Policy directives specified in the Content Security Policy Level 3 Working Draft.
 * @constant {Set<string>}
 * @private
 */
const contentSecurityPolicyDirectives = new Set([ "child-src", "connect-src", "default-src", "font-src", "frame-src", "img-src", "manifest-src", "media-src", "object-src", "prefetch-src", "script-src", "script-src-elem", "script-src-attr", "style-src", "style-src-attr", "worker-src" ]);

/**
 * The Content Security Policy fallback directives specified in the Content Security Policy Level 3 Working Draft.
 * Property names are directive names and property values are arrays of fallback directive names.
 * @constant {Object}
 * @private
 */
const contentSecurityPolicyDirectiveFallbacks = {
    "script-src-elem": [ "script-src-elem", "script-src", "default-src" ],
    "script-src-attr": [ "script-src-attr", "script-src", "default-src" ],
    "style-src-elem": [ "style-src-elem", "style-src", "default-src" ],
    "style-src-attr": [ "style-src-attr", "style-src", "default-src" ],
    "worker-src": [ "worker-src", "child-src", "script-src", "default-src" ],
    "connect-src": [ "connect-src", "default-src" ],
    "manifest-src": [ "manifest-src", "default-src" ],
    "prefetch-src": [ "prefetch-src", "default-src" ],
    "object-src": [ "object-src", "default-src" ],
    "frame-src": [ "frame-src", "child-src", "default-src" ],
    "media-src": [ "media-src", "default-src" ],
    "font-src": [ "font-src", "default-src" ],
    "img-src": [ "img-src", "default-src" ]
}

/**
 * Parses a Content Security Policy from a string. We do not validate the manifest Content Security Policy because
 * the browser validates it.
 * @param {string} contentSecurityPolicyString - The input Content Security Policy string.
 * @returns {ContentSecurityPolicy} The parsed Content Security Policy.
 * @private
 */
function parseContentSecurityPolicy(contentSecurityPolicyString) {
    const parsedContentSecurityPolicy = {};
    const directiveNameAndValueStrings = contentSecurityPolicyString.split(/;(?: )*/);
    for(const directiveNameAndValueString of directiveNameAndValueStrings) {
        const directiveNameAndValueTokens = directiveNameAndValueString.split(/(?: )+/);
        if(directiveNameAndValueTokens.length > 0) {
            const directiveName = directiveNameAndValueTokens[0];
            const directiveValues = directiveNameAndValueTokens.slice(1);
            if(contentSecurityPolicyDirectives.has(directiveName)) {
                parsedContentSecurityPolicy[directiveName] = directiveValues;
            }
        }
    }
    return parsedContentSecurityPolicy;
}

/**
 * Check that a directive is provided in a Content Security Policy.
 * @param {*} directiveName - The name of the directive to check.
 * @param {*} directiveValue - The value of the directive to check.
 * @param {*} contentSecurityPolicy - The Content Security Policy to check the directive against.
 * @param {boolean} [checkFallbackDirectives=true] - Whether to check the fallback directives for the specified directive.
 * @private
 */
function checkContentSecurityPolicyDirective(directiveName, directiveValue, contentSecurityPolicy, checkFallbackDirectives = true) {
    if(directiveName in contentSecurityPolicy) {
        if(contentSecurityPolicy[directiveName].includes(directiveValue)) {
            return true;
        }
        return false;
    }
    if(checkFallbackDirectives && directiveName in contentSecurityPolicyDirectiveFallbacks) {
        for(const fallbackDirectiveName of contentSecurityPolicyDirectiveFallbacks[directiveName]) {
            if(fallbackDirectiveName in contentSecurityPolicy) {
                if(contentSecurityPolicy[fallbackDirectiveName].includes(directiveValue)) {
                    return true;
                }
                return false;
            }
        }
    }
    return false;
}

/**
 * Check that the WebExtensions manifest includes specified API and origin permissions.
 * @param {Object} options
 * @param {string[]} [options.requiredPermissions=[]] - WebExtensions API permissions that are required.
 * @param {string[]} [options.suggestedPermissions=[]] - WebExtensions API permissions that are recommended.
 * @param {string[]} [options.requiredOrigins=[]] - Origin permissions that are required.
 * @param {string[]} [options.suggestedOrigins=[]] - Origin permissions that are recommended.
 * @param {ContentSecurityPolicy} [options.requiredContentSecurityPolicy = {}] - Content Security Policy directives that are required.
 * @param {ContentSecurityPolicy} [options.suggestedContentSecurityPolicy = {}] - Content Security Policy directives that are recommended.
 * @param {string} [options.warn=true] - Whether to output any missing required or suggested permissions with `console.warn()`.
 * @param {string} [options.module="moduleNameNotProvided"] - The name of the module having its permissions checked, used in warning
 * output.
 * @returns {boolean} Whether the WebExtensions manifest includes the required WebExtensions API permissions, origin permissions, and
 * Content Security Policy directives.
 */
export async function check({
    requiredPermissions = [],
    requiredOrigins = [],
    suggestedPermissions = [],
    suggestedOrigins = [],
    requiredContentSecurityPolicy = {},
    suggestedContentSecurityPolicy = {},
    warn = true,
    module = "moduleNameNotProvided"
}) {
    // If this function is called in an environment other than a background script (e.g., a content script
    // or a worker script), that could mean the call isn't in the right location (i.e., the check is running
    // on a code path that doesn't depend on the permissions), or that could mean the call reflects incorrect
    // use of background script code in a non-background environment. Since we cannot distinguish these
    // situations, we output a warning to the console and return true.
    if((typeof browser !== "object") || !("permissions" in browser)) {
        console.warn(`Unable to check ${module} permissions in an environment without browser.permissions. This warning may indicate incorrect use of a background script function in a content script or worker script.`);
        return true;
    }

    let passed = true;

    // API permissions
    if(requiredPermissions.length > 0) {
        const requiredPermissionsCheck = await browser.permissions.contains({ permissions: requiredPermissions });
        passed = passed && requiredPermissionsCheck;
        if(!requiredPermissionsCheck && warn) {
            console.warn(`${module} is missing required API permissions: ${JSON.stringify(requiredPermissions)}`);
        }
    }
    if(suggestedPermissions.length > 0) {
        const suggestedPermissionsCheck = await browser.permissions.contains({ permissions: suggestedPermissions });
        if(!suggestedPermissionsCheck && warn) {
            console.warn(`${module} is missing recommended API permissions: ${JSON.stringify(suggestedPermissions)}`);
        }
    }

    // Origin permissions
    if(requiredOrigins.length > 0) {
        const requiredOriginsCheck = await browser.permissions.contains({ origins: requiredOrigins });
        passed = passed && requiredOriginsCheck;
        if(!requiredOriginsCheck && warn) {
            console.warn(`${module} is missing required origin permissions: ${JSON.stringify(requiredOrigins)}`);
        }
    }
    if(suggestedOrigins.length > 0) {
        const suggestedOriginsCheck = await browser.permissions.contains({ origins: suggestedOrigins });
        if(!suggestedOriginsCheck && warn) {
            console.warn(`${module} is missing recommended origin permissions: ${JSON.stringify(suggestedOrigins)}`);
        }
    }

    // Content Security Policy directives
    // The default CSP for WebExtensions is "script-src 'self'; object-src 'self';"
    // See https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy
    let manifestContentSecurityPolicyString = "script-src 'self'; object-src 'self';";
    const manifest = browser.runtime.getManifest();
    if(("content_security_policy" in manifest) && (manifest["content_security_policy"] !== null)) {
        manifestContentSecurityPolicyString = manifest["content_security_policy"];
    }
    const manifestContentSecurityPolicy = parseContentSecurityPolicy(manifestContentSecurityPolicyString);
    let passedRequiredContentSecurityPolicy = true;
    for(const directiveName of Object.keys(requiredContentSecurityPolicy)) {
        for(const directiveValue of requiredContentSecurityPolicy[directiveName]) {
            passedRequiredContentSecurityPolicy = passedRequiredContentSecurityPolicy && checkContentSecurityPolicyDirective(directiveName, directiveValue, manifestContentSecurityPolicy);
        }
    }
    passed = passed && passedRequiredContentSecurityPolicy;
    if(!passedRequiredContentSecurityPolicy && warn) {
        console.warn(`${module} is missing required Content Security Policy directives: ${JSON.stringify(requiredContentSecurityPolicy)}`);
    }
    let passedSuggestedContentSecurityPolicy = true;
    for(const directiveName of Object.keys(suggestedContentSecurityPolicy)) {
        for(const directiveValue of suggestedContentSecurityPolicy[directiveName]) {
            passedSuggestedContentSecurityPolicy = passedSuggestedContentSecurityPolicy && checkContentSecurityPolicyDirective(directiveName, directiveValue, manifestContentSecurityPolicy);
        }
    }
    passed = passed && passedSuggestedContentSecurityPolicy;
    if(!passedSuggestedContentSecurityPolicy && warn) {
        console.warn(`${module} is missing recommended Content Security Policy directives: ${JSON.stringify(suggestedContentSecurityPolicy)}`);
    }

    return passed;
}

/**
 * Retrieve the origin match patterns permitted by the extension manifest.
 */
export function getManifestOriginMatchPatterns() {
    const manifest = browser.runtime.getManifest();
    const matchPatterns = [ ];
    if(("permissions" in manifest) && Array.isArray(manifest.permissions)) {
        for(const permission of manifest.permissions) {
            try {
                matching.matchPatternsToRegExp([ permission ]);
                matchPatterns.push(permission);
            }
            catch(error) {
                continue;
            }
        }
    }
    return matchPatterns;
}
