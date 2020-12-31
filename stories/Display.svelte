<script>
    import Main from "../src/app/routes/Main.svelte";
    const data = Array.from({length:10}).fill(0);
</script>

<Main {data} />
