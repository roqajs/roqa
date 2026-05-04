import type { ComponentIR } from "roqa/compiler";

export interface RoqaFrontend {
	handles(id: string): boolean;
	toMIR(code: string, id: string): ComponentIR | ComponentIR[];
}

export default function jsx(): RoqaFrontend;
