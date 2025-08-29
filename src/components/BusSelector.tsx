// components/BusSelector.tsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config"; // Use API_BASE_URL for backend requests

interface Bus {
  id: string;
  registrationNo: string;
  [key: string]: any; // allow extra fields
}

interface Props {
  search: string;
  setSearch: (value: string) => void;
  selectedBus: string | null;
  setSelectedBus: (bus: string | null) => void;
}

const BusSelector: React.FC<Props> = ({
  search,
  setSearch,
  selectedBus,
  setSelectedBus,
}) => {
  const [busList, setBusList] = useState<Bus[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const fetchBuses = async () => {
      try {
        // Use API_BASE_URL and correct endpoint
        const res = await axios.get<any>(`${API_BASE_URL}/vehicles`);
        const buses = res.data?.data || res.data || [];
        setBusList(buses);
      } catch (err) {
        console.error("Error fetching buses:", err);
      }
    };

    fetchBuses();
  }, []);

  // Filter by registrationNo (case-insensitive)
  const filtered =
    search.length === 0
      ? []
      : busList.filter((bus) =>
          bus.registrationNo
            .toLowerCase()
            .includes(search.toLowerCase())
        );

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow border border-gray-200 dark:border-gray-700 space-y-4">
      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
        Select Bus
      </label>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedBus(null);
            setShowSuggestions(true);
          }}
          placeholder="Search by registration number..."
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 rounded-md px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {filtered.length > 0 && showSuggestions && (
          <ul className="absolute z-20 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 mt-1 rounded-md shadow-md max-h-48 overflow-y-auto">
            {filtered.map((bus) => (
              <li
                key={bus.id}
                onClick={() => {
                  setSelectedBus(bus.registrationNo);
                  setSearch(bus.registrationNo);
                  setShowSuggestions(false);
                }}
                className="px-4 py-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 text-sm"
              >
                {bus.registrationNo}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedBus ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Selected: <span className="font-medium">{selectedBus}</span>
        </p>
      ) : (
        <p className="text-sm text-gray-400 italic">No bus selected</p>
      )}
    </section>
  );
};

export default BusSelector;
