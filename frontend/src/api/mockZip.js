const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createHeader(signature, size) {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint32(0, signature, true);
  return { buffer, view };
}

export function createMockResultZip(job) {
  const files = [
    [
      "results/predictions.json",
      JSON.stringify(
        {
          job_id: job.id,
          model_id: job.model_id,
          predictions: [],
          note: "This is a mock result. No inference was run.",
        },
        null,
        2,
      ),
    ],
    [
      "results/annotated_images/README.txt",
      "No annotated images are available in mock mode.\n",
    ],
    ["results/labels/README.txt", "No label files are available in mock mode.\n"],
    [
      "report/summary.json",
      JSON.stringify({ job_id: job.id, status: job.status, mock: true }, null, 2),
    ],
    [
      "manifest.json",
      JSON.stringify(
        {
          job_id: job.id,
          files: [
            "results/predictions.json",
            "results/annotated_images/",
            "results/labels/",
            "report/summary.json",
          ],
        },
        null,
        2,
      ),
    ],
  ].map(([name, content]) => ({
    name: encoder.encode(name),
    data: encoder.encode(content),
  }));

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  files.forEach(({ name, data }) => {
    const checksum = crc32(data);
    const { buffer, view } = createHeader(0x04034b50, 30);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    localParts.push(new Uint8Array(buffer), name, data);

    const { buffer: centralBuffer, view: centralView } = createHeader(
      0x02014b50,
      46,
    );
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(new Uint8Array(centralBuffer), name);
    localOffset += 30 + name.length + data.length;
  });

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const { buffer, view } = createHeader(0x06054b50, 22);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, localOffset, true);

  return new Blob([...localParts, ...centralParts, new Uint8Array(buffer)], {
    type: "application/zip",
  });
}
