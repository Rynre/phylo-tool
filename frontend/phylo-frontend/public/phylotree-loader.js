if (!window.__PHYL_TREE_LOADED__) {
  window.__PHYL_TREE_LOADED__ = true;

  const d3Script = document.createElement("script");
  d3Script.src = "https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js";
  d3Script.onload = () => {
    const phyloScript = document.createElement("script");
    phyloScript.src =
      "https://cdn.jsdelivr.net/npm/phylotree@2.0.0/dist/phylotree.js";
    phyloScript.onload = () => {
      console.log("Phylotree.js v2 fully loaded");
    };
    document.body.appendChild(phyloScript);
  };

  document.body.appendChild(d3Script);
}
