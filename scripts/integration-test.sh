#!/bin/bash
set -eo pipefail

export PATH=$PATH:./node_modules/.bin

echo "Building test extension..."
pwd
pushd tests/integration/extension
npm install ../../../
npm install && npm run build && npm run package
popd

echo "Testing Firefox with extension"
npm run test:integration:jest -- --test_browser=firefox --load_extension=true --headless_mode=true  2>&1 | tee integration.log
# FIXME Chrome Headless mode does not support extensions, need to set up a display server if we want this to work.
# echo "Testing Chrome with extension"
# npm run test:integration:jest -- --test_browser=chrome --load_extension=true --headless_mode=false 2>&1 | tee integration.log
