<script>
import { getContext } from 'svelte';
import { tweened } from 'svelte/motion';
import { cubicInOut } from 'svelte/easing';
import CursorIcon from './CursorIcon.svelte'
export let x = 0;
export let y = 0;

const duration = getContext('CURSOR_TIME');

const params = { duration, easing: cubicInOut };

let innerX = tweened(x, params);
let innerY = tweened(y, params);
$: innerX.set(x);
$: innerY.set(y);
</script>

<style>
div {
    position: absolute;
    border-radius: 50%;
}
</style>



<div style="left: {$innerX}px; top: {$innerY}px;"><CursorIcon /></div>