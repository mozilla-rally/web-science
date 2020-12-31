<style>
div {
    display: contents;
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
</style>
<div>
    <slot />
</div>