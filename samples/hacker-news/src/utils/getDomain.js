export const getDomain = (url) => {
	if (!url) return "";
	try {
		const domain = new URL(url).hostname.replace("www.", "");
		return domain;
	} catch {
		return "";
	}
};
