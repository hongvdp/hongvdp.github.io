const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

const cLower = "abcdefghijklmnopqrstuvwxyz";
const cUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const cNumbers = "0123456789";
const cSymbols = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const cAmbiguous = "iIl1L| o0O `'-_\": ;.,";
const cBrackets = "<>()[]{}"

function retrieveQueryParams()
{
	if (urlParams.has("length")) {
		var l = urlParams.get("length");		
		eLength.value = l;
	}

	if (urlParams.has("lower")) {
		eLower.checked = urlParams.get("lower") === 'true';
	}
	if (urlParams.has("upper")) {
		eUpper.checked = urlParams.get("upper") === 'true';
	}
	if (urlParams.has("numbers")) {
		eNumbers.checked = urlParams.get("numbers") === 'true';
	}

	if (urlParams.has("symbols")) {
		eSymbols.checked = urlParams.get("symbols") === 'true';
	}

	if (urlParams.has("excludes")) {
		eExcludes.value = decodeURIComponent(urlParams.get("excludes"));
	}

	if (urlParams.has("includes")) {
		eIncludes.value = decodeURIComponent(urlParams.get("includes"));
	}

	if (urlParams.has("ambiguous")) {
		eAmbiguous.checked = urlParams.get("ambiguous") === 'true';
	}

	if (urlParams.has("brackets")) {
		eBrackets.checked = urlParams.get("brackets") === 'true';
	}
}

function buildQuery() {

	const params = new URLSearchParams({
		length: eLength.value,
		lower: eLower.checked,
		upper: eUpper.checked,
		numbers: eNumbers.checked,
		symbols: eSymbols.checked,
		brackets: eBrackets.checked,
		ambiguous: eAmbiguous.checked
	});

	if (eExcludes.value != '')
		params.set('excludes', encodeURIComponent(eExcludes.value));

	if (eIncludes.value != '')
		params.set('includes', encodeURIComponent(eIncludes.value));
	
	
	var query = params.toString();
	return query;
}

function GeneratePassword() {
	var pwd = doGenerate();	

	ePwd.value = pwd;
	eUrl.href = window.location.origin + window.location.pathname + "?" + buildQuery();
}

function doGenerate() {
	let characters = "";
	eNumbers.checked ? (characters += cNumbers) : "";
	eSymbols.checked ? (characters += cSymbols) : "";
	eLower.checked ? (characters += cLower) : "";
	eUpper.checked ? (characters += cUpper) : "";
	eIncludes.value != '' ? (characters = addCharsToString(characters, eIncludes.value)) : "";

	eBrackets.checked ? (characters = removeCharsFromString(characters, cBrackets)) : "";
	eAmbiguous.checked ? (characters = removeCharsFromString(characters, cAmbiguous)) : "";
	eExcludes.value != '' ? (characters = removeCharsFromString(characters, eExcludes.value)) : "";
	

	let password = "";
	let pLength = eLength.value === '' ? 6 : eLength.value;
	for (let i = 0; i < pLength; i++) {
		password += characters.charAt(
			Math.floor(Math.random() * characters.length)
		);
	}

	let bitLength = Math.log2(characters.length) * password.length;
	eBitLength.innerHTML = bitLength.toFixed(2);
	eCharsLength.innerHTML = characters.length;
	return password;

}

function doCopy() {
	document.getElementById("password").select();
	document.execCommand("copy");
	alert("Password Copied");
	return false;
}

function removeCharsFromString(orgString, removeChars) {
	let ret = orgString;
	for (var i = 0; i < removeChars.length; i++) {
		ret = ret.split(removeChars[i]).join("");
	}	
	return ret;
}
function addCharsToString(orgString, addChars) {
	let ret = orgString;
	for (var i = 0; i < addChars.length; i++) {
		ret = ret.split(addChars[i]).join("");
		ret = ret + addChars[i];
	}
	return ret;
}