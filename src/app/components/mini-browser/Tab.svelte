<script>
import { createEventDispatcher } from 'svelte';
import slideHorizontal from "./slide-horizontal";
export let active = false;
	
const dispatch = createEventDispatcher();
function dispatchClose() { dispatch("close"); };

export let container;
export let close;

</script>

<style>
	div {
		background-color: transparent;
	}
	button {
		background-color: transparent;
		text-align:left;
		font-size: var(--sp5);
		padding: var(--sp25);
		/* font-size: .5rem;
		padding: .25rem; */
		display: grid;
		grid-template-columns: max-content auto max-content;
		grid-column-gap: var(--sp25);
		/* grid-column-gap: .25rem; */
		align-items: center;
		/* width: 6rem; */
		width: calc(var(--s1) * 6);
		color: #666;
		border: none;
		cursor: pointer;
		margin: 0;
		transition: background-color 100ms;
	}
	
	div:hover {
		background-color: var(--bg2-hover);
	}
	.active, .active:hover  {
		background-color: var(--bg2);
	}
	
	svg {
		justify-self: end;
	}
</style>

<div bind:this={container} class:active class="tab" transition:slideHorizontal>
<button on:click>
	<div style="display: contents;">
		<slot name='icon'></slot>		
	</div>
	<slot></slot>
	<svg  bind:this={close} on:click|stopPropagation={dispatchClose} width=".5rem" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M6.10001 1.90335C6.03773 1.84093 5.95318 1.80585 5.86501 1.80585C5.77683 1.80585 5.69228 1.84093 5.63001 1.90335L4.00001 3.53002L2.37001 1.90002C2.30773 1.8376 2.22318 1.80252 2.13501 1.80252C2.04683 1.80252 1.96228 1.8376 1.90001 1.90002C1.77001 2.03002 1.77001 2.24002 1.90001 2.37002L3.53001 4.00002L1.90001 5.63002C1.77001 5.76002 1.77001 5.97002 1.90001 6.10002C2.03001 6.23002 2.24001 6.23002 2.37001 6.10002L4.00001 4.47002L5.63001 6.10002C5.76001 6.23002 5.97001 6.23002 6.10001 6.10002C6.23001 5.97002 6.23001 5.76002 6.10001 5.63002L4.47001 4.00002L6.10001 2.37002C6.22667 2.24335 6.22667 2.03002 6.10001 1.90335Z" fill="black" fill-opacity="0.54"/>
</svg>

</button>
	</div>