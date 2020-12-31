<script>
import ToolbarButtons from './ToolbarButtons.svelte';
import RightToolbar from './RightToolbar.svelte';
</script>

<style>
	.container {
		--bg1: #c4c4c4;
		--bg2: #E0E0E0;
		--bg2-hover: #D0D0D0;
		--bg3: white;
		--sp125: calc(var(--s1) * .125);
		--sp25: calc(var(--s1) * .25);
		--sp5: calc(var(--s1) * .5);
		--sp75: calc(var(--s1) * .75);
		--s1: 20px; /* change this one to change sizing */
		--s1p25: calc(var(--s1) * 1.25);
		--s2: calc(var(--s1) * 2 );
		--s20: calc(var(--s1) * 20);
		--s30: calc(var(--s1) * 30);
	}
	.browser {
		width: calc(var(--s1) * 25);
		height: calc(var(--s1) * 18);
		background-color: var(--bg1);
		border-radius: .25rem;
		display: grid;
		grid-template-rows: max-content auto;
		align-content: stretch;
	}
	
	.top-bar {
		display: grid;
		grid-template-columns: max-content auto;
		align-items: center;
	}
	
	.toolbar {
		/* height: 1.25rem; */
		height: var(--s1p25);
		display: grid;
		grid-template-columns: max-content auto max-content;
		align-items: center;
	}
	
	.window-buttons {
		display: grid;
		grid-auto-flow: column;
		/* grid-gap: .25rem;
		padding: .25rem;
		padding-right: 1rem; */
		grid-gap: var(--sp25);
		padding: var(--sp25);
		padding-right: var(--s1);
	}
	
	.window-buttons div {
		background-color: var(--bg2);
		/* width: .5rem;
		height: .5rem; */
		width: var(--sp5);
		height: var(--sp5);
		border-radius: 50%;
	}
	
	.tabs {
		display: flex;
/* 		gap: .5rem; */
	}
	
	.omnibar {
		--w: var(--s1);
		background-color: var(--bg3);
		align-self: stretch;
		/* border-radius: .125rem;
		font-size: .5em; */
		border-radius: var(--sp125);
		font-size: var(--sp5);
		display: flex;
		justify-content: start;
		color: var(--bg1);
		align-items: center;
		/* padding-left: .25rem;
		padding-right: .25rem; */
		padding-left: var(--sp25);
		padding-right: var(--sp25);
	}
	
	:global(.omnibar span) {
		--w: 1;
		display: inline-block;
		min-width: calc(var(--s1) * var(--w));
		background-color: var(--bg2);
		margin-left: var(--sp125);
		margin-right: var(--sp125);
		border-radius: var(--sp125);
		height: var(--sp5);
		/* margin-left: .125em;
		margin-right: .125em;
		border-radius: .25em;
		height: 1em; */
	}
	
	.lower {
		background-color: var(--bg2);
		height: 100%;
		border-bottom-left-radius: var(--sp25);
		border-bottom-right-radius: var(--sp25);
		/* border-bottom-left-radius: 4px;
		border-bottom-right-radius: 4px; */
		/* padding: .25rem; */
		padding: var(--sp25);
		display: grid;
		grid-template-rows: max-content auto;
		/* grid-row-gap: .25rem; */
		grid-row-gap: var(--sp25);
	}
	
	.window {
		background-color: var(--bg3);
		display: grid;
		align-content: stretch;
		justify-content: stretch;
	}
	
</style>

<div class='container'>
<div class=browser>
	<section class=top-bar>
		<section class=window-buttons>
			<div></div>
			<div></div>
			<div></div>
		</section>
		<section class=tabs>
			<slot name='tabs' />
		</section>
	</section>
	<section class=lower>
		<section class=toolbar>
			<ToolbarButtons />
			<div class='omnibar'>
				<slot name='url' />
			</div>
			<RightToolbar />
		</section>
		<section class=window>
			<slot name='window' />
		</section>
	</section>
</div>
<slot name='cursor'></slot>
</div>
