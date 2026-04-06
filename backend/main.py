from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import tempfile
import os
import uuid

app = FastAPI()

# Allow frontend to access backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/run-iqtree")
async def run_iqtree(
    matrix: str = Form(...),
    model: str = Form(...),
    datatype: str = Form(...)
):
    """
    Runs IQ-TREE with correct datatype handling.
    Supports:
      - DNA: JC, HKY, GTR, MFP
      - STANDARD: MK, MK+G, MK+I+G, MFP
    """

    # Create a temporary working directory
    workdir = tempfile.mkdtemp()
    nex_path = os.path.join(workdir, "matrix.nex")

    # Write NEXUS file exactly as received from frontend
    with open(nex_path, "w") as f:
        f.write(matrix)

    # Build IQ-TREE command
    # iqtree3 is correct for Windows builds
    cmd = [
        "iqtree3",
        "-s", nex_path,
        "-m", model,
        "-nt", "1",  # single thread for stability
        "-quiet"     # cleaner output
    ]

    try:
        result = subprocess.run(
            cmd,
            cwd=workdir,
            check=True,
            capture_output=True,
            text=True
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=f"IQ-TREE error:\n{e.stderr}"
        )

    # IQ-TREE outputs a .treefile
    treefile = os.path.join(workdir, "matrix.nex.treefile")

    if not os.path.exists(treefile):
        raise HTTPException(
            status_code=500,
            detail="IQ-TREE did not produce a treefile."
        )

    # Read the Newick tree
    with open(treefile, "r") as f:
        newick = f.read().strip()

    return {"tree": newick}
