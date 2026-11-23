const properties = pluginContext.properties;
const apiKey = String(properties.apiKey || "").trim();
const locale = pluginContext.language;
const messages =
  locale === "ar"
    ? {
        map: "خرائط Google",
        addApiKey: "أضف مفتاح Google Maps JavaScript API صالحاً في الخصائص.",
        loading: "جارٍ تحميل الخريطة…",
        sharedKey:
          "يجب أن تستخدم إضافات خرائط Google في الصفحة المفتاح نفسه؛ أعد التحميل بعد تغييره.",
        loadFailed: "تعذر تحميل خرائط Google.",
      }
    : {
        map: "Google Map",
        addApiKey: "Add a valid Google Maps JavaScript API key in the properties.",
        loading: "Loading map…",
        sharedKey:
          "All Google Map plugins on the page must use the same API key; reload after changing it.",
        loadFailed: "Google Maps could not be loaded.",
      };
const status = root.querySelector("[data-map-status]");
const mapCanvas = root.querySelector("[data-map-canvas]");
root.querySelector(".map-widget").setAttribute("aria-label", messages.map);
const loaderKey = "__embedlyGoogleMapsApiLoader";
const callbackName = "__embedlyGoogleMapsApiReady";
let active = true;
let map;
let marker;
let mapListeners = [];

function showStatus(message, isError = false) {
  status.hidden = !message;
  status.textContent = message;
  status.dataset.error = String(isError);
}

function loadGoogleMaps() {
  const existing = window[loaderKey];
  if (existing) {
    if (existing.apiKey !== apiKey)
      return Promise.reject(
        new Error(messages.sharedKey),
      );
    return existing.promise;
  }
  if (window.google?.maps)
    return Promise.resolve(window.google.maps);

  let script;
  const promise = new Promise((resolve, reject) => {
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google.maps);
    };
    script = document.createElement("script");
    script.async = true;
    script.onerror = () => {
      delete window[callbackName];
      delete window[loaderKey];
      reject(new Error(messages.loadFailed));
    };
    const url = new URL("https://maps.googleapis.com/maps/api/js");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("loading", "async");
    url.searchParams.set("language", locale);
    script.src = url.toString();
    document.head.append(script);
  });
  window[loaderKey] = { apiKey, promise, script };
  return promise;
}

if (!apiKey) {
  showStatus(messages.addApiKey);
} else {
  showStatus(messages.loading);
  loadGoogleMaps()
    .then((maps) => {
      if (!active || !mapCanvas.isConnected) return;
      const latitude = Math.max(-85, Math.min(85, Number(properties.latitude) || 0));
      const longitude = Math.max(-180, Math.min(180, Number(properties.longitude) || 0));
      const zoom = Math.max(1, Math.min(20, Math.round(Number(properties.zoom) || 12)));
      map = new maps.Map(mapCanvas, {
        center: { lat: latitude, lng: longitude },
        zoom,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "cooperative",
      });
      marker = new maps.Marker({
        map,
        position: { lat: latitude, lng: longitude },
        title: String(properties.markerTitle || ""),
        draggable: properties.draggableMarker === true,
      });
      mapListeners.push(
        map.addListener("click", (event) => {
          if (!event.latLng) return;
          pluginContext.emit("onMapClick", {
            latitude: event.latLng.lat(),
            longitude: event.latLng.lng(),
          });
        }),
        marker.addListener("dragend", (event) => {
          if (!event.latLng) return;
          pluginContext.emit("onMarkerDragEnd", {
            latitude: event.latLng.lat(),
            longitude: event.latLng.lng(),
          });
        }),
      );
      showStatus("");
    })
    .catch((error) => {
      if (!active) return;
      console.error("Google Map plugin failed to initialize.", error);
      showStatus(error.message, true);
    });
}

return () => {
  active = false;
  mapListeners.forEach((listener) => listener.remove());
  mapListeners = [];
  marker?.setMap(null);
  if (map && window.google?.maps)
    window.google.maps.event.clearInstanceListeners(map);
};
