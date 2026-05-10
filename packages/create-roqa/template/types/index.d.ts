import type { ComponentIR } from "roqa/compiler";

export interface RoqaFrontend {
	handles(id: string): boolean;
	toIR(code: string, id: string): ComponentIR | ComponentIR[];
}

export default function my_frontend(): RoqaFrontend;
