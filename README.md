# Mozilla Rally study template.
The purpose of this repository is to provide a starting point to build a Rally study.

## Getting started

1. Fork this repository.
2. Customize the [manifest.json](./manifest.json) file:
  * change the `name`, `author`, and `description` properties;
  * swap the value of `application.gecko.id` (e.g. `ion-basic-study@mozilla.org`) with the one provided you by the Rally team;
3. Customize the [package.json](./package.json) file. At a bare minimum, change the `name`,`description`, `version`, `author`, `repository`, `bugs`, and `homepage` properties;
4. Provide the encryption data to the `Rally` class constructor in the [src/background.js](./src/background.js) file:

```js
rally.initialize(
  // A sample key id used for encrypting data.
  "sample-invalid-key-id",
  // A sample *valid* JWK object for the encryption.
  {
    "kty":"EC",
    "crv":"P-256",
    "x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
    "y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
    "kid":"Public key used in JWS spec Appendix A.3 example"
  }
);
```

4. From the forked repository directory, install all the NPM dependencies:

```bash
fork-dir> npm install .
```

5. Test the customized study in Firefox and commit your changes: doing this right after the initial fork provides a nice and clean cutting point with the original repository, which will simplify future updates (if needed).

## Building upon this template
This template uses [rollup.js](https://rollupjs.org/) as a module bundler and NPM for dependency management. The [manifest.json](./manifest.json) file already includes a sample background scripts.

Dependencies can be added using the [`npm install`](https://docs.npmjs.com/cli/v6/commands/npm-install) command, using the appropriate `--save-dev` or `--save-prod` switch. This command will take care of automatically updating the [package.json](./package.json) file.

New modules can be added in the `src/` directory. Modules need to expose the exported functions using the `module.exports` syntax. For example, a class can be exported as follows in a `MyClass.js` file:

```js
module.exports = class MyClass {
  myFunc() {
    console.log("Testing!");
  }
}
```

And then be imported in another file with `const MyClass = require("./MyClass.js");`.

Plain functions can be exposed as follows in a `MyFuncs.js` file:

```js
module.exports = {
  myTest() {
    //... something!
  },
  otherFunc() {
    // ... other function!
  }
};
```

And then be imported in another file with `const {myTest, otherFunc} = require("./MyFuncs.js");`.

## Supported NPM commands
The template comes with a set of pre-defined NPM commands (to run as `npm run <command>`) to help study authors:

* `build`: assembles the final addon. The bundler generated code is saved in the `dist/` directory.
* `lint`: run linting on the add-on code.
* `package`: packages the final archive containing the bundled addon, is saved in the `web-ext-artifacts` directory.
* `start`: build the addon and run a Firefox instance and side-load the add-on for manual testing or debugging purposes.
* `test-integration`: perform the provided integration test for the final addon.

## Manual testing in the browser
To test, either load as a temporary add-on in Firefox (`about:debugging`) or Chrome ("developer mode" in `chrome://extensions`) or use `npm run start`.
