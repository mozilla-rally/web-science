<script>
    import { onMount } from "svelte";
    import { fly } from "svelte/transition";
    import { downloadJSON } from './download';
    import Table from "../components/Table.svelte";
    export let data;

    let mounted = false;
    onMount(() => {
        mounted = true;
    });
</script>

{#if mounted}
    <div class="admin" in:fly={{ duration: 800, y: 5 }}>
        <header>
            <h1>Browsing Time Tracker</h1>
            <div>
                <button on:click={() => downloadJSON(data, `browsing-${new Date().toISOString().replace(/:/g, '-').replace('.', '-')}.json`)} disabled={data.length === 0} class="btn-primary download-csv"><Table size="1.25em" />
                    Download CSV</button>
            </div>
        </header>
        <main>
            {#if data.length}
                {data.length}
                item{data.length === 1 ? '' : 's'}.
            {:else}no browsing data yet{/if}
        </main>
    </div>
{/if}
