<style>
.event {
	font-family: monospace;
	tab-size: 10px;
	font-size: var(--sp75);
	position: relative;
	background-color: white;
	padding: var(--s1);
	height: var(--s20);
	width: calc(var(--s1) * 18);
	overflow: hidden;
}

.bottom-fader {
	justify-self: stretch;
	position: absolute;
	height: calc(var(--s1) * 6);
	bottom: 0px;
	width: 100%;
	background: linear-gradient(to top, white 40%, transparent);
}

.right-fader {
	position: absolute;
	height: var(--s20);
	right: 0;
	top: 0;
	width: calc(var(--s1) * 4);
	background: linear-gradient(to left, white 10%, transparent);
}
</style>

<div class="omnibar event" style="--w: var(--s1);">
    <slot />
<div class='bottom-fader'></div>
<div class='right-fader'></div>
</div>