<script>
    import Main from "../src/app/routes/Main.svelte";
    const data = [
  {
    "start": "2021-01-03T20:05:29.746Z",
    "url": "about:blank",
    "reason": "tab-created",
    "status": "loading",
    "end": "2021-01-03T20:05:30.013Z",
    "elapsed": 267
  },
  {
    "start": "2021-01-03T20:05:30.014Z",
    "url": "https://www.newyorker.com/magazine/1996/10/21/the-outsider-9",
    "reason": "tab-updated",
    "status": "complete",
    "title": "THE OUTSIDER | The New Yorker",
    "end": "2021-01-03T20:05:32.013Z",
    "elapsed": 1999
  },
  {
    "start": "2021-01-03T20:05:32.013Z",
    "url": "https://news.ycombinator.com/",
    "reason": "tab-removed",
    "end": "2021-01-03T20:05:33.377Z",
    "elapsed": 1364
  },
  {
    "start": "2021-01-03T20:05:33.378Z",
    "url": "about:addons",
    "reason": "tab-removed",
    "end": "2021-01-03T20:05:34.644Z",
    "elapsed": 1266
  },
  {
    "start": "2021-01-03T20:05:34.644Z",
    "url": "https://twitter.com/davedaley3/status/1345821765369524225",
    "reason": "tab-activated",
    "status": "complete",
    "title": "Home / Twitter",
    "end": "2021-01-03T20:05:42.210Z",
    "elapsed": 7566
  },
  {
    "start": "2021-01-03T20:05:42.210Z",
    "url": "about:blank",
    "reason": "tab-created",
    "status": "loading",
    "end": "2021-01-03T20:05:42.422Z",
    "elapsed": 212
  },
  {
    "start": "2021-01-03T20:05:42.422Z",
    "url": "https://t.co/KkD58n3HKD?amp=1",
    "reason": "tab-updated",
    "status": "loading",
    "title": "elidourado.com/blog/notes-on-technology-2020s/",
    "end": "2021-01-03T20:05:42.666Z",
    "elapsed": 244
  },
  {
    "start": "2021-01-03T20:05:42.667Z",
    "url": "https://elidourado.com/blog/notes-on-technology-2020s/",
    "reason": "tab-updated",
    "status": "loading",
    "title": "frbsf.org/economic-research/indicators-data/total-factor-productivity-tfp/",
    "end": "2021-01-03T20:05:50.064Z",
    "elapsed": 7397
  },
  {
    "start": "2021-01-03T20:05:50.064Z",
    "url": "https://www.frbsf.org/economic-research/indicators-data/total-factor-productivity-tfp/",
    "reason": "tab-updated",
    "status": "loading",
    "title": "Federal Reserve Bank of San Francisco | Total Factor Productivity, TFP Economics",
    "end": "2021-01-03T20:05:53.814Z",
    "elapsed": 3750
  },
  {
    "start": "2021-01-03T20:05:53.816Z",
    "url": "about:blank",
    "reason": "tab-created",
    "end": "2021-01-03T20:05:53.879Z",
    "elapsed": 63
  },
  {
    "start": "2021-01-03T20:05:53.880Z",
    "url": "moz-extension://bf334f4a-0329-0b4c-98dd-0be15c24593a/public/index.html",
    "reason": "tab-updated",
    "status": "complete",
    "title": "Rally Study",
    "end": "2021-01-03T20:08:50.083Z",
    "elapsed": 176203
  },
  {
    "start": "2021-01-03T20:08:50.084Z",
    "url": "https://www.frbsf.org/economic-research/indicators-data/total-factor-productivity-tfp/",
    "reason": "tab-removed",
    "end": "2021-01-03T20:08:50.529Z",
    "elapsed": 445
  },
  {
    "start": "2021-01-03T20:08:50.529Z",
    "url": "https://slate.com/news-and-politics/2019/10/alec-meeting-gerrymandering-audio-recording.html",
    "reason": "tab-removed",
    "end": "2021-01-03T20:08:51.282Z",
    "elapsed": 753
  },
  {
    "start": "2021-01-03T20:08:51.283Z",
    "url": "about:addons",
    "reason": "tab-activated",
    "end": "2021-01-03T20:08:51.601Z",
    "elapsed": 318
  },
  {
    "start": "2021-01-03T20:08:51.602Z",
    "url": "https://prospect.org/politics/tale-of-two-senate-rallies-loeffler-ossoff-georgia-senate-runoffs/",
    "reason": "tab-removed",
    "end": "2021-01-03T20:08:52.110Z",
    "elapsed": 508
  },
  {
    "start": "2021-01-03T20:08:52.110Z",
    "url": "https://www.newyorker.com/magazine/1996/10/21/the-outsider-9",
    "reason": "tab-removed",
    "end": "2021-01-03T20:08:52.657Z",
    "elapsed": 547
  },
  {
    "start": "2021-01-03T20:08:52.657Z",
    "url": "https://www.washingtonpost.com/politics/trump-raffensperger-call-georgia-vote/2021/01/03/d45acb92-4dc4-11eb-bda4-615aaefd0555_story.html",
    "reason": "tab-removed",
    "end": "2021-01-03T20:08:52.845Z",
    "elapsed": 188
  },
  {
    "start": "2021-01-03T20:08:52.845Z",
    "url": "https://slate.com/news-and-politics/2019/10/alec-meeting-gerrymandering-audio-recording.html",
    "reason": "tab-removed",
    "end": "2021-01-03T20:08:53.042Z",
    "elapsed": 197
  },
  {
    "start": "2021-01-03T20:08:53.042Z",
    "url": "https://twitter.com/home",
    "reason": "tab-removed",
    "end": "2021-01-03T20:09:13.286Z",
    "elapsed": 20244
  },
  {
    "start": "2021-01-03T20:09:13.286Z",
    "url": "https://docs.google.com/document/d/1VelLUahRKgi6C4taPU8aF6PjBznHxMj_-ivzqgR8M2I/edit#",
    "reason": "tab-activated",
    "end": "2021-01-03T20:09:14.191Z",
    "elapsed": 905
  },
  {
    "start": "2021-01-03T20:09:14.192Z",
    "url": "https://twitter.com/home",
    "reason": "tab-activated",
    "status": "loading",
    "end": "2021-01-03T20:09:15.533Z",
    "elapsed": 1341
  },
  {
    "start": "2021-01-03T20:09:15.533Z",
    "url": "about:blank",
    "reason": "tab-created",
    "end": "2021-01-03T20:09:15.592Z",
    "elapsed": 59
  }
]
;
</script>

<Main {data} />
