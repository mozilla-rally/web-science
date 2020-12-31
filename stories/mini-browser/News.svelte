<script>
import { fly } from 'svelte/transition';
import Menu from '../../src/app/components/mini-browser/Menu.svelte';
import Search from '../../src/app/components/mini-browser/Search.svelte';
</script>

<style>
.site {
    position: relative;
}

.header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    justify-items: center;
    align-items: center;
    margin-bottom: var(--s1);
    padding: var(--sp25);
    border-bottom: calc(var(--sp125) * .5) solid var(--bg2);
}

.left-side {
    justify-self: start;
    display: grid;
    grid-auto-flow: column;
    align-items: center;
    grid-column-gap: var(--sp25);
}

.right-side {
    display: grid;
    grid-auto-flow: column;
    grid-column-gap: var(--sp25);
    justify-content: end;
    justify-self: end;
}

.article {
    margin: auto;
    width: calc(var(--s1) * 12);
    overflow: hidden;
}

.text-block {
    --gap: var(--sp25);
    display: grid;
    grid-auto-flow: row;
    grid-row-gap: var(--gap);
}

.text {
    --w: 1;
    --h: 1;
    width: calc(100% * var(--w));
    height: calc(var(--sp5) * var(--h));
    background-color: var(--bg2);
    border-radius: var(--sp125);
}

.fade {
    position: absolute;
    background: linear-gradient(to top, white 30%, transparent);
    width: 100%;
    height: calc(var(--s1) * 8);
    bottom:0px;
}
</style>

<div class="site" in:fly={{duration: 200, y: 4}}>
    <div class='header'>
        <div class="left-side" style="font-size: var(--sp5);"><Menu /> <Search /> </div>
        <div class="text" style="width: calc(var(--s1) * 4); background-color: var(--bg1);"></div>
        <div class="right-side">
            <div class="text" style="width: calc(var(--s1) * 1);"></div>
            <div class="text" style="width: calc(var(--s1) * 1);"></div>
        </div>
    </div>
    <div class="article text-block" style="--gap: var(--s1);">
        <div class='text-block' style="width: 80%; margin: auto;">
            <div class="text" style="--h: 1.35;"></div>
            <div class="text" style="--h: .45; --w: .45;"></div>
        </div>
        <div class='text-block'>
            <div class="text"></div>
            <div class="text"></div>
            <div class="text"></div>
            <div class="text"></div>
            <div class="text" style="--w: .25; margin-bottom: var(--s1);"></div>
            <div class="text"></div>
            <div class="text"></div>
            <div class="text"></div>
            <div class="text" style="--w: .35; margin-bottom: var(--s1);"></div>
            <div class="text"></div>
        </div>
    </div>
    <div class="fade"></div>
</div>