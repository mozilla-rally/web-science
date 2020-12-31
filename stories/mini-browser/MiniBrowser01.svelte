<script>
	import { onMount, setContext } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { get } from 'svelte/store';
	import { flip } from 'svelte/animate';
	import Container from '../../src/app/components/mini-browser/Container.svelte';
	import MiniBrowser from '../../src/app/components/mini-browser/MiniBrowser.svelte';
	import Tab from '../../src/app/components/mini-browser/Tab.svelte';
	import SocialMedia from '../../src/app/components/mini-browser/SocialMedia.svelte';
	import Search from '../../src/app/components/mini-browser/Search.svelte';
	import News from '../../src/app/components/mini-browser/News.svelte';
	import Cursor from '../../src/app/components/mini-browser/Cursor.svelte';
	import SearchBody from './Search.svelte';
	import SocialMediaBody from './SocialMedia.svelte';
	import NewsBody from './News.svelte';

	import Event from '../../src/app/components/mini-browser/Event.svelte';
	import EventContainer from '../../src/app/components/mini-browser/EventContainer.svelte';
	
	const CURSOR_TIME = 500;
	const EVENT_TRANSITION = 150;
	setContext('CURSOR_TIIME', CURSOR_TIME);
	setContext('EVENT_TRANSITION', EVENT_TRANSITION);

	let tabs = [
		{name: "search", id: 0, icon: Search, url: `<span></span> :// <span></span> . <span style="--w: 2;"></span> . <span style="--w:.75"></span>`, content: SearchBody},
		{name: "social media", id: 1, icon: SocialMedia, url: `<span></span> :// <span></span> . <span style="--w: 2.3"></span> . <span style="--w:.75"></span> / <span style="--w:1"></span>`, content: SocialMediaBody},
		{name: "news", id: 2, icon: News, url: `<span></span> :// <span></span> . <span style="--w: 1.8;"></span> . <span style="--w:.75"></span> / <span style="--w:1.2"></span> / <span style="--w:.7"></span> / <span style="--w:1.2"></span> ? <span style="--w:.8"></span> = <span style="--w:1.2"></span>`, content: NewsBody},
	];
	
	let which = tabs[0];
	let timer;
	let events = [];
	function setActiveTab(w) {
		// move the mouse
		const nextTab = tabs.find(t=> t.id === w);
		setCoords(nextTab.container);
		// clear any timer.
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => { 
			which = nextTab;
			// add the next event.
			events.unshift({
				uri: which.url, 
				elapsed: Math.round(get(elapsed) * 1000),
				start: (new Date()).toISOString(),
				id: Math.max(...events.map(e=> e.id), -1) + 1  });
			if (events.length > 6) {
				events.pop();
			}
			events = events;
			startElapsedTimer();
		}, CURSOR_TIME);
	}

	let elapsedTimer;
	let ms = 0;

	function startElapsedTimer() {
		if (elapsedTimer) {
			ms = 1000;
			elapsed.set(0, { duration: 0 });
			elapsed.set(ms);
			clearInterval(elapsedTimer);
		}
		elapsedTimer = setInterval(() => {
			ms += 1000;
			elapsed.set(ms);
		}, 1000)
	};

	let elapsed = tweened(0, { duration: 1000 });
	
	elapsed.subscribe(ms => {
		if (events.length)  events[0].elapsed = ~~ms;
	});

	startElapsedTimer();
	
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

	onMount(() => {
		setActiveTab(0);
		setTab();
	})
	let coords = {x: 300, y: 300};

	function setCoords(tab) {
		if (tab) {
			coords = tab.getBoundingClientRect();
			coords.x = (coords.left + coords.right) / 2;
			coords.y = (coords.bottom + coords.top) / 2;
		}
	}

	function setTab() {
		setTimeout(() => {
			if (which.id === 0) {
				setActiveTab(2);
			} else {
				setActiveTab(0);
			}
			setTab();
		}, CURSOR_TIME * 4 + Math.random());
	}

</script>

<style>
.container {
	display: grid;
	grid-template-columns: max-content max-content;
	grid-column-gap: 16px;
}
</style>

<Container>
	<div class='container'>
		<MiniBrowser>
			<div style='display:contents;' slot='tabs'>
				{#each tabs as tab (tab.id)}
					<Tab active={which.id===tab.id} 
							on:click={() => setActiveTab(tab.id)}
							on:close={() => closeTab(tab.id)}
							bind:container={tab.container}
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
				{#if which.content}
					<svelte:component this={which.content} />
				{/if}
			</div>
			<div slot="cursor">
				<Cursor x={coords.x} y={coords.y} />
			</div>
		</MiniBrowser>

	<EventContainer>
		{#each events as event, i (event.id)}
		<div animate:flip={{duration: EVENT_TRANSITION}}>
			<Event end={i === event.length - 1} active={i === 0} elapsed={event.elapsed} uri={event.uri} start={event.start} />
		</div>
		{/each}
	</EventContainer>
</Container>