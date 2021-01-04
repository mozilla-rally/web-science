<script>
export let data = [];
</script>

<style>
.summary {

}
.data {
    overflow-x: auto;
}
</style>

<div class='summary'>
    <div>total elapsed time: {~~(data.reduce((acc,v) => acc + v.elapsed, 0) / 1000)} sec</div>
</div>
<div class='data'>
{#each data as datum}
    <pre>
        {JSON.stringify(datum, null, 2)}
    </pre>
{/each}
</div>