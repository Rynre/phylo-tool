"use client";

import { useState, useEffect } from "react";
import TreeViewer from "./TreeViewer";

export default function MatrixPage() {
  const [taxa, setTaxa] = useState(["Root", "Taxon_1", "Taxon_2"]);
  const [characters, setCharacters] = useState(["Char1", "Char2", "Char3"]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [treeResult, setTreeResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("MFP");

  // NEW: datatype state
  const [datatype, setDatatype] = useState("STANDARD");

  // Detect datatype automatically
  const detectDatatype = () => {
    const values = Object.values(matrix)
      .flatMap((row) => Object.values(row))
      .filter((v) => v && v !== "?");

    if (values.length === 0) return "STANDARD";

    const dnaSet = new Set(["A", "C", "G", "T"]);
    const binarySet = new Set(["0", "1"]);

    const isDNA = values.every((v) => dnaSet.has(v.toUpperCase()));
    const isBinary = values.every((v) => binarySet.has(v));

    if (isDNA) return "DNA";
    if (isBinary) return "STANDARD";
    return "MIXED";
  };

  useEffect(() => {
    setDatatype(detectDatatype());
  }, [matrix]);

  const dnaModels = ["MFP", "JC", "HKY", "GTR"];
  const morphModels = ["MFP", "MK", "MK+G", "MK+I+G"];

  const updateCell = (taxon: string, char: string, value: string) => {
    setMatrix((prev) => ({
      ...prev,
      [taxon]: {
        ...(prev[taxon] || {}),
        [char]: value,
      },
    }));
  };

  const addTaxon = () => {
    const newName = `Taxon_${taxa.length}`;
    setTaxa([...taxa, newName]);
  };

  const addCharacter = () => {
    const newChar = `Char${characters.length + 1}`;
    setCharacters([...characters, newChar]);
  };

  // ⭐ NEW: Remove Taxon (with renumbering + undeletable first 3)
  const removeTaxon = (name: string) => {
    if (["Root", "Taxon_1", "Taxon_2"].includes(name)) return;
    if (taxa.length <= 3) return;

    const filtered = taxa.filter((t) => t !== name);

    // Renumber: Root stays Root, others become Taxon_1, Taxon_2, ...
    const fixed = filtered.map((t, i) => {
      if (i === 0) return "Root";
      return `Taxon_${i}`;
    });

    setTaxa(fixed);

    // Fix matrix keys
    setMatrix((prev) => {
      const updated: any = {};
      fixed.forEach((t) => {
        updated[t] = prev[t] || {};
      });
      return updated;
    });
  };

  // ⭐ NEW: Remove Character (with renumbering + undeletable first 3)
  const removeCharacter = (char: string) => {
    if (["Char1", "Char2", "Char3"].includes(char)) return;
    if (characters.length <= 3) return;

    const filtered = characters.filter((c) => c !== char);

    // Renumber: Char1, Char2, Char3, ...
    const fixed = filtered.map((c, i) => `Char${i + 1}`);

    setCharacters(fixed);

    // Fix matrix values
    setMatrix((prev) => {
      const updated: any = {};
      for (const taxon in prev) {
        updated[taxon] = {};
        fixed.forEach((c) => {
          updated[taxon][c] = prev[taxon][c] || "?";
        });
      }
      return updated;
    });
  };

  const buildNexusString = () => {
    let nexus = "#NEXUS\n";

    nexus += "BEGIN TAXA;\n";
    nexus += `DIMENSIONS NTAX=${taxa.length};\n`;
    nexus += "TAXLABELS\n";
    taxa.forEach((taxon) => {
      nexus += ` ${taxon}\n`;
    });
    nexus += ";\nEND;\n\n";

    nexus += "BEGIN CHARACTERS;\n";
    nexus += `DIMENSIONS NCHAR=${characters.length};\n`;

    const formatLine =
      datatype === "DNA"
        ? 'FORMAT DATATYPE=DNA MISSING=? GAP=-;'
        : 'FORMAT DATATYPE=STANDARD MISSING=? GAP=- SYMBOLS="01";';

    nexus += formatLine + "\n";
    nexus += "MATRIX\n";

    taxa.forEach((taxon) => {
      const row = characters
        .map((char) => matrix[taxon]?.[char] || "?")
        .join("");
      nexus += ` ${taxon} ${row}\n`;
    });

    nexus += ";\nEND;\n";

    return nexus;
  };

  const generateNexus = () => {
    const nexus = buildNexusString();
    const blob = new Blob([nexus], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "matrix.nex";
    a.click();
  };

  const sendToBackend = async () => {
    setLoading(true);
    setTreeResult("");

    const nexus = buildNexusString();
    const formData = new FormData();
    formData.append("matrix", nexus);
    formData.append("model", selectedModel);
    formData.append("datatype", datatype);

    try {
      const response = await fetch("http://127.0.0.1:8000/run-iqtree", {
        method: "POST",
        body: formData,
      });

      const raw = await response.text();
      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        setTreeResult("Backend returned nonJSON error.");
        setLoading(false);
        return;
      }

      if (data.detail) {
        setTreeResult("Error: " + data.detail);
        setLoading(false);
        return;
      }

      setTreeResult(data.tree || "");
    } catch (err) {
      setTreeResult("Error: Could not reach backend.");
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#1f2937",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* --- Top Navigation Bar --- */}
      <header
        style={{
          width: "100%",
          padding: "16px 32px",
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "20px",
            fontWeight: 600,
            color: "#111827",
          }}
        >
          🧬 Character Matrix Builder
        </h1>
      </header>

      {/* --- Main Content Area --- */}
      <main
        style={{
          flexGrow: 1,
          padding: "32px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: "1200px" }}>
          {/* --- Matrix Builder Card --- */}
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              padding: "24px",
              marginBottom: "32px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
            }}
          >
            <h2
              style={{
                margin: 0,
                marginBottom: "16px",
                fontSize: "18px",
                fontWeight: 600,
              }}
            >
              Matrix Editor
            </h2>

            {/* DATATYPE BADGE */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "999px",
                background:
                  datatype === "DNA"
                    ? "#dbeafe"
                    : datatype === "STANDARD"
                    ? "#e0f2fe"
                    : "#fef3c7",
                color:
                  datatype === "DNA"
                    ? "#1e40af"
                    : datatype === "STANDARD"
                    ? "#0369a1"
                    : "#92400e",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "12px",
                border:
                  datatype === "MIXED"
                    ? "1px solid #fcd34d"
                    : "1px solid #bfdbfe",
              }}
            >
              {datatype === "DNA" && "🧬 DNA Detected"}
              {datatype === "STANDARD" && "🔢 STANDARD (0/1) Detected"}
              {datatype === "MIXED" && "⚠️ Mixed Characters Detected"}
            </div>

            <div style={{ marginBottom: "16px" }}>
              <button
                onClick={addTaxon}
                style={{
                  marginRight: 10,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  cursor: "pointer",
                }}
              >
                + Add Taxon
              </button>

              <button
                onClick={addCharacter}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  cursor: "pointer",
                }}
              >
                + Add Character
              </button>
            </div>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 20,
                background: "white",
              }}
            >
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th
                    style={{
                      padding: "10px",
                      border: "1px solid #e5e7eb",
                      textAlign: "left",
                    }}
                  >
                    Taxon
                  </th>

                  {characters.map((char) => (
                    <th
                      key={char}
                      style={{
                        padding: "10px",
                        border: "1px solid #e5e7eb",
                        textAlign: "left",
                        position: "relative",
                      }}
                    >
                      {char}

                      {/* ⭐ Remove Character Button */}
                      {characters.length > 3 &&
                        !["Char1", "Char2", "Char3"].includes(char) && (
                          <button
                            onClick={() => removeCharacter(char)}
                            style={{
                              marginLeft: "6px",
                              background: "transparent",
                              border: "none",
                              color: "#dc2626",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            ×
                          </button>
                        )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {taxa.map((taxon) => (
                  <tr key={taxon}>
                    <td
                      style={{
                        padding: "10px",
                        border: "1px solid #e5e7eb",
                        background: "#fafafa",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      {taxon}

                      {/* ⭐ Remove Taxon Button */}
                      {taxa.length > 3 &&
                        !["Root", "Taxon_1", "Taxon_2"].includes(taxon) && (
                          <button
                            onClick={() => removeTaxon(taxon)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#dc2626",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            ×
                          </button>
                        )}
                    </td>

                    {characters.map((char) => (
                      <td
                        key={char}
                        style={{
                          padding: "10px",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <input
                          type="text"
                          maxLength={1}
                          onChange={(e) =>
                            updateCell(taxon, char, e.target.value)
                          }
                          style={{
                            width: "40px",
                            padding: "6px",
                            borderRadius: "6px",
                            border: "1px solid #d1d5db",
                            textAlign: "center",
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* MODEL DROPDOWN */}
            <div style={{ marginTop: 20 }}>
              <label style={{ marginRight: 10, fontWeight: 600 }}>Model:</label>

              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                }}
              >
                {(datatype === "DNA" ? dnaModels : morphModels).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={generateNexus}
                style={{
                  marginRight: 10,
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  cursor: "pointer",
                }}
              >
                Download NEXUS File
              </button>

              <button
                type="button"
                onClick={sendToBackend}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {loading ? "Running IQTREE..." : "Run IQTREE"}
              </button>
            </div>
          </div>

          {/* --- Tree Viewer Card --- */}
          {treeResult && (
            <div
              style={{
                background: "white",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                padding: "24px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: "16px",
                  fontSize: "18px",
                  fontWeight: 600,
                }}
              >
                Phylogenetic Tree
              </h2>

              <TreeViewer newick={treeResult} />
            </div>
          )}
        </div>
      </main>

      {/* --- Footer --- */}
      <footer
        style={{
          padding: "16px",
          textAlign: "center",
          fontSize: "13px",
          color: "#6b7280",
        }}
      >
        Built with Coffee by Ryan Rai
      </footer>
    </div>
  );
}
