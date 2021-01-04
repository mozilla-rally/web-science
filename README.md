# First Rally Study

## to use this repository to collect your own data and play with it:

1. fork or clone this repository
2. run `npm install`
3. if you are:
   1. a chrome user: run `npm run build-addon`, then [follow the instructions to load an unpacked web extension](https://developer.chrome.com/docs/extensions/mv2/getstarted/). You will 
   2. a firefox user: 
      1. you'll have to use Nightly & set `xpinstall.signatures.required` to `false` in `about:config`. 
      2. then run `npm run build-addon`.
      3. Then you can load the add-on from `about:addons`.
4. browse for a few days to generate data.
5. Go the the extension page and click the `download JSON` on the top right.

