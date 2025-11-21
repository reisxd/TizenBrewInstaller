import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect } from 'react';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

export default function Item({ children, onClick }) {
  const { ref, focused } = useFocusable();
  useEffect(() => {
    if (focused) {
      ref.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    }
  }, [focused, ref]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={classNames(
        'relative bg-gray-900 shadow-2xl rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10 h-[35vh] w-[20vw] hover-effect cursor-pointer',
        focused ? 'focus' : '',
      )}
    >
      {children}
    </div>
  );
}