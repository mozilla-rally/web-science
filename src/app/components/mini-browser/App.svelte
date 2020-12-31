<script>
	import Tab from './Tab.svelte';
	import MiniBrowser from './MiniBrowser.svelte';
	import SocialMedia from './SocialMedia.svelte';
	import Search from './Search.svelte';
	import News from './News.svelte';
	
	let tabs = [
		{name: "search", id: 0, icon: Search, url: `<span></span> :// <span></span> . <span style="--w: 2em;"></span> . <span style="--w:.75em"></span>`},
		{name: "social media", id: 1, icon: SocialMedia, url: `<span></span> :// <span></span> . <span style="--w: 2.3em;"></span> . <span style="--w:.75em"></span> / <span style="--w:1em"></span>`},
		{name: "news", id: 2, icon: News, url: `<span></span> :// <span></span> . <span style="--w: 1.8em;"></span> . <span style="--w:.75em"></span> / <span style="--w:1.2em"></span> / <span style="--w:.7em"></span> / <span style="--w:1.2em"></span> ? <span style="--w:.8em"></span> = <span style="--w:1.2em"></span>`},
	]
	
	let which = tabs[0];
	function setActiveTab(w) {
		which = {...tabs.find(t=> t.id === w)};
	}
	
	function closeTab(tabID) {
			if (which.id === tabID) {
				const ind = tabs.findIndex(t=> t.id === tabID);
				let nextIndex;
				if (ind === tabs.length - 1) {
					nextIndex = tabs.length - 1;
				} else if (ind === 0) {
					nextIndex = 1;
				} else {
					nextIndex = ind - 1;
				}
				setActiveTab(nextIndex);
			}
			tabs = tabs.filter(t => t.id !== tabID).map(t => ({...t}));
	}
</script>

<MiniBrowser>
	<div style='display:contents;' slot='tabs'>
		{#each tabs as tab (tab.id)}
			<Tab active={which.id===tab.id} 
					on:click={() => setActiveTab(tab.id)}
					on:close={() => closeTab(tab.id)}
			>
				<div slot=icon style='display: contents;'>
				{#if tab.icon}
					<svelte:component this={tab.icon} />
				{/if}
				</div>
				{tab.name}</Tab>
		{/each}
	</div>
	<div style='display: contents;' slot='url'>
		{#if which.url}
			{@html which.url}
		{/if}
	</div>
	<div style="display: contents;" slot='window'>
		Howdy!!!!
	</div>
</MiniBrowser>