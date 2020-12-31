<script>
    import { fly } from 'svelte/transition';
    import SearchIcon from '../../src/app/components/mini-browser/Search.svelte';
</script>

<style>
    div {
        display: grid;
        grid-auto-flow: row;
        align-content: center;
        justify-content: center;
    }

    .search-bar {
        width: calc(var(--s1) * 10);
        border: 2px solid var(--bg2);
        border-radius: var(--sp25);
        display: grid;
        grid-auto-flow: column;
        align-items: center;
        padding: var(--sp25);
    }

    .search-buttons {
        margin: auto;
    }

    button {
        height: var(--sp75);
        width: calc(var(--s1) * 2.5);
        background-color: var(--bg2);
        border: none;
        border-radius: var(--sp125);
    }
</style>

<div in:fly={{duration: 200, y: 4}}>
    <section class='header'>
    </section>
    <section class='search-bar'>
        <SearchIcon />
    </section>
    <section class='search-buttons'>
        <button></button>
        <button></button>
    </section>
</div>