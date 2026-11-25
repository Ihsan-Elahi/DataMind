function StatCard({ title, value, change, icon: Icon, color }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`rounded-xl p-3 ${color}`}>
          <Icon size={21} />
        </div>

        <span className="text-xs font-semibold text-emerald-600">
          {change}
        </span>
      </div>

      <p className="mt-5 text-sm text-slate-500">{title}</p>

      <h3 className="mt-1 text-3xl font-bold text-slate-900">
        {value}
      </h3>
    </div>
  );
}

export default StatCard;