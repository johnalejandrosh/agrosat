"use client";

import CIcon from "@coreui/icons-react";
import type { ComponentProps } from "react";

/** CIcon usa hooks y CoreUI no declara "use client": este envoltorio permite usarlo desde componentes de servidor. */
export function Icon(props: ComponentProps<typeof CIcon>) {
  return <CIcon {...props} />;
}
