<script>
    import { onMount, createEventDispatcher } from "svelte";
    import { fly } from "svelte/transition";
    import { downloadJSON } from './download';
    import ViewData from '../components/ViewData.svelte';
    import Table from "../components/Table.svelte";
    export let data;

    let mounted = false;
    onMount(() => {
        mounted = true;
    });

    const dispatch = createEventDispatcher();
</script>

<style>
.cta {
    display: flex;
    gap: .5em;
}
</style>

{#if mounted}
    <div class="admin" in:fly={{ duration: 800, y: 5 }}>
        <header>
            <h1>Browsing Time Tracker</h1>
            <div class='cta'>
                <button disabled={data.length === 0} on:click={() => { dispatch('reset-data'); }} class='btn btn-secondary'>Reset Data</button>
                <button on:click={() => downloadJSON(data, `browsing-${new Date().toISOString().replace(/:/g, '-').replace('.', '-')}.json`)} disabled={data.length === 0} class="btn btn-primary download-csv"><Table size="1.25em" />
                    Download JSON</button>
            </div>
        </header>
        <main>
            {#if data.length}
                {data.length}
                item{data.length === 1 ? '' : 's'}.
                <ViewData {data} />
            {:else}no browsing data yet{/if}
        </main>
    </div>
{/if}
