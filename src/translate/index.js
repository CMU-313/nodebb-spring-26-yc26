
/* eslint-disable strict */
//var request = require('request');

const translatorApi = module.exports;

// translatorApi.translate = function (postData) {
// return ['is_english',postData];
// };

translatorApi.translate = async function (postData) {
	// 1. Safely dig out the text, no matter how NodeBB nested it
	const textToTranslate = postData.content || (postData.post && postData.post.content) || '';

	// 2. CI/CD Bypass
	if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
		return [true, textToTranslate]; 
	}

	// 3. Live API Call
	try {
		const TRANSLATOR_API = `http://17313-team09.s3d.cmu.edu:5000`;
		const response = await fetch(`${TRANSLATOR_API}/?content=${encodeURIComponent(textToTranslate)}`);
		const data = await response.json();
		return [data.is_english, data.translated_content];
	} catch (err) {
		// Fallback: If the Python server is offline, keep the original text
		return [true, textToTranslate];
	}
};