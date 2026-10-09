const API_KEY = "eae34d787e598ca353d730ea77b6bced";

const lat = 11.2433;
const lon = 125.0047;

const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    units: "metric",
    appid: API_KEY
});

const url = `https://api.openweathermap.org/data/4.0/onecall/current?${params}`;

console.log("Testing:", url.replace(API_KEY, "HIDDEN"));

const response = await fetch(url);
const data = await response.json();

console.log("Status:", response.status);
console.log(JSON.stringify(data, null, 2));