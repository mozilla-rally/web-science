/**
 * This module facilitates checking that required permissions are
 * provided in the WebExtensions manifest.
 * 
 * @module webScience.permissions
 */

/**
 * Check that the WebExtensions manifest includes specified API and origin permissions.
 * @param {Object} options
 * @param {string[]} [options.requiredPermissions=[]] - WebExtensions API permissions that are required.
 * @param {string[]} [options.suggestedPermissions=[]] - WebExtensions API permissions that are recommended.
 * @param {string[]} [options.requiredOrigins=[]] - Origin permissions that are required.
 * @param {string[]} [options.suggestedOrigins=[]] - Origin permissions that are recommended.
 * @param {string} [options.warn=true] - Whether to output any permissions errors on console.warn.
 * @param {string} [options.module="moduleNameNotProvided"] - The name of the module having its permissions checked.
 * @returns {boolean} Whether the permissions check passed.
 */
export async function check({
    requiredPermissions = [],
    requiredOrigins = [],
    suggestedPermissions = [],
    suggestedOrigins = [],
    warn = true,
    module = "moduleNameNotProvided"
}) {
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

    return passed;
}
