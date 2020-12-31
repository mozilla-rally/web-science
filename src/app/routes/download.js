const a = document.createElement('a');
a.style = "display: none;";
document.body.appendChild(a);

function download(data, name, method = JSON.strringify) {
    const serialized = method(data);
    const blob = new Blob([serialized], {type: "octet/stream"});
    const url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.click();
    window.URL.revokeObjectURL(url);
}

// FIXME: implement this too
// export function downloadCSV(data, name) {
//     download(data, name)
// }

export function downloadJSON(data, name) {
    download(data, name, JSON.stringify);
}
