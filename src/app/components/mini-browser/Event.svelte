<script>
import { getContext } from 'svelte';
import { fade } from 'svelte/transition';
export let elapsed = 0;
export let uri;
export let start;
export let active = false;
export let duration = getContext('EVENT_TRANSITION');
</script>

<style>
div {
  color: #888;
  white-space: pre;
	font-family: monospace;
	font-size: calc(var(--s1) * .65);
}

.active {
  color: #666;
  font-weight: bold;
}
</style>

<div class:active transition:fade|local={{ duration: duration * 1.5 }}>
{"{"}
  elapsed: {elapsed},
  start: "{start}",
  uri: "{@html uri}",
  ...
{"}"}
</div>