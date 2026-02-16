const ALIGN_CLASSES = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export default function DataTable({ id, title, columns, rows }) {
  return (
    <div data-id={id} className="bg-gray-800/80 backdrop-blur rounded-xl p-6">
      {title && <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-700/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-gray-300 text-xs uppercase tracking-wider ${
                    ALIGN_CLASSES[col.align] || ALIGN_CLASSES.left
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`${
                  rowIndex % 2 === 0 ? "bg-gray-800/30" : "bg-transparent"
                } hover:bg-gray-700/30 transition`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm text-gray-300 ${
                      ALIGN_CLASSES[col.align] || ALIGN_CLASSES.left
                    }`}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
