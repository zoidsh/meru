export function createElementProcessedAttributeFromPreloadArgument(
	preloadArgument: string,
) {
	return preloadArgument.replace("--", "data-");
}

export function createElementNotProcessedSelector(
	selector: string,
	processedAttribute: string,
) {
	return `${selector}:not([${processedAttribute}])`;
}
