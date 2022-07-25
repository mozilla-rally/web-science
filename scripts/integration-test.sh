#!/bin/bash
set -eo pipefail

XVFB_RUN() {
    if hash xvfb-run 2>/dev/null
    then
        xvfb-run "$@"
    else
        echo "WARN: xvfb-run must be installed to run Chrome with extensions enabled on a headless server"
        "$@"
    fi
}

export PATH=$PATH:./node_modules/.bin

echo "Building test extension..."
pwd
pushd tests/integration/extension
npm install ../../../
npm install && npm run build && npm run package
popd

#echo "Testing Firefox headless with extension"
#npm run test:integration:jest -- --test_browser=firefox --load_extension=true --headless_mode=true  2>&1 | tee integration.log
# NOTE Chrome Headless mode does not support extensions, so we use `xvfb` as the display server.
echo "Testing Chrome non-headless with extension"
XVFB_RUN npm run test:integration:jest -- --test_browser=chrome --load_extension=true --headless_mode=false 2>&1 | tee integration.log
