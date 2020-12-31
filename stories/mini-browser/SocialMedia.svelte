<script>
    import { fly } from 'svelte/transition';
</script>

<style>
.site {
    display: grid;
    grid-template-columns: calc(var(--s1) * 5) auto calc(var(--s1) * 5);
    width: calc(var(--s1) * 20);
    margin: auto;
    margin-top: var(--s1);
    position: relative;
}

.profile {
    padding: var(--s1);
    padding-top:0;
}

.profile-picture {
    --w: 2;
    background-color: var(--bg2);
    border-radius: 50%;
    width: calc(var(--s1) * var(--w));
    height: calc(var(--s1) * var(--w));
    justify-self: center;
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

.newsfeed {
    display: grid;
    grid-auto-flow: row;
    grid-row-gap: var(--sp75);
    align-content: start;
}

.post {
    display: grid;
    grid-template-columns: max-content auto;
    grid-column-gap: var(--sp25);
    justify-content: stretch;
}

.post-input {
    border: 2px solid var(--bg2);
    border-radius: var(--sp25);
    padding: var(--sp25);
}

.fade {
    position: absolute;
    background: linear-gradient(to top, white, transparent);
    width: 100%;
    height: calc(var(--s1) * 4);
    bottom:0px;
}
</style>

<div class='site' in:fly={{duration: 200, y: 4}}>
    <section class='profile'>
        <div class='text-block' style="--gap: var(--sp5);">
            <div class='profile-picture'></div>
            <div class='text-block'>
                <div class='text'></div>
                <div style="--w:.65;" class='text'></div>
            </div>
            <!-- <div class='links text-block' style="--gap: var(--sp25);">
                <div class='text' style="--w:1; --h: 4;"></div>
            </div> -->
        </div>
    </section>
    <section class='newsfeed'>
        <div class='post post-input post-content'>
            <div class='profile-picture' style="--w:1;"></div>
            <div class='post-content'>
                <div class='links text-block' style="--gap: var(--sp25);">
                    <div class='text' style="--w:1; --h: .55;"></div>
                    <div class='text' style="--w:1; --h: .55; justify-self: end; margin-bottom: var(--sp5);"></div>
                    <div class='text' style="--w:.15; --h: 1; justify-self: end; align-self: end;"></div>
                </div>

            </div>
        </div>
        {#each Array.from({length: 5}).fill(null) as _, i}
            <div class='post'>
                <div class='profile-picture' style="--w:1;"></div>
                <div class='post-content'>
                    <div class='links text-block' style="--gap: var(--sp25);">
                        {#if i === 1}
                            <div class='text' style="--h:4;"></div>    
                        {:else}
                        <div class='text' style="--w:1; --h: .65;"></div>
                        <div class='text' style="--w:1; --h: .65;"></div>
                        <div class='text' style="--w:{.4 + Math.random() * .4}; --h: .65;"></div>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
    </section>
    <div class=fade></div>
</div>