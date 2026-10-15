import { useApp } from '@/store/AppContext.jsx';
import { Icon } from '@/components/ui.jsx';

const COLORS = { ok: 'border-green-500', err: 'border-red-500', info: 'border-sky-500', warn: 'border-amber-500' };
const ICONS = { ok: 'circle-check-big', err: 'circle-alert', info: 'info', warn: 'triangle-alert' };
const ICON_CLS = { ok: 'text-green-400', err: 'text-red-400', warn: 'text-amber-400', info: 'text-sky-400' };

export default function Toasts() {
  const { toasts } = useApp();
  return (
    <div id="toasts" className="fixed z-[60] top-4 right-4 space-y-2 w-[320px] max-w-[calc(100vw-2rem)]">
      {toasts.map((x) => (
        <div key={x.id} className={`toast-in bg-[#0b2447] text-white rounded-2xl p-3.5 flex gap-2.5 items-start shadow-pop border-l-4 ${COLORS[x.type] || COLORS.ok}`}>
          <Icon name={ICONS[x.type] || ICONS.ok} className={`w-5 h-5 mt-0.5 shrink-0 ${ICON_CLS[x.type] || ICON_CLS.ok}`} />
          <div className="text-[13px] font-medium leading-snug">{x.msg}</div>
        </div>
      ))}
    </div>
  );
}
