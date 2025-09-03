// src/components/LocationMapModal.tsx
import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Dialog } from "@headlessui/react";
import "leaflet/dist/leaflet.css";
import MapInitializer from "./MapInitializer";

interface Props {
  latitude: number;
  longitude: number;
  isOpen: boolean;
  onClose: () => void;
}

const LocationMapModal: React.FC<Props> = ({ latitude, longitude, isOpen, onClose }) => {
  const isDark = document.documentElement.classList.contains("dark");

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-2xl overflow-hidden">
          <div className="p-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              📍 Alert Location
            </h2>

            <div className="h-[300px] rounded overflow-hidden">
              <MapContainer
                center={[latitude, longitude]}
                zoom={13}
                scrollWheelZoom={false}
                style={{ height: "100%", width: "100%" }}
              >
                <MapInitializer latitude={latitude} longitude={longitude} />

                <TileLayer
                  url={
                    isDark
                      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  }
                  attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
                />

                <Marker position={[latitude, longitude]}>
                  <Popup>
                    Latitude: {latitude.toFixed(4)}, Longitude: {longitude.toFixed(4)}
                  </Popup>
                </Marker>
              </MapContainer>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default LocationMapModal;
