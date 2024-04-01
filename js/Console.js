//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

var Console;

var Console = function(options) {

	if (!options.handleCommand && !options.outputOnly) {
		throw new Error("You must specify either options.handleCommand(input) or options.outputOnly");
	}

	var output_only = options.outputOnly;
	var handle_command = options.handleCommand;
	var placeholder = options.placeholder || "";
	var autofocus = options.autofocus;
	var storage_id = options.storageID || "simple-console";

	var add_svg = function(to_element, icon_class_name, svg, viewBox = "0 0 16 16") {
		var icon = document.createElement("span");
		icon.className = icon_class_name;
		icon.innerHTML = '<svg width="1em" height="1em" viewBox="' + viewBox + '">' + svg + '</svg>';
		to_element.insertBefore(icon, to_element.firstChild);
	};

	var add_chevron = function(to_element) {
		add_svg(to_element, "input-chevron",
			'<path d="M6,4L10,8L6,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>'
		);
	};

    var add_help_icon = function(to_element) {
		add_svg(to_element, "input-help",
			'<path style="fill:currentColor" d="M15.255,0c5.424,0,10.764,2.498,10.764,8.473c0,5.51-6.314,7.629-7.67,9.62c-1.018,1.481-0.678,3.562-3.475,3.562 c-1.822,0-2.712-1.482-2.712-2.838c0-5.046,7.414-6.188,7.414-10.343c0-2.287-1.522-3.643-4.066-3.643 c-5.424,0-3.306,5.592-7.414,5.592c-1.483,0-2.756-0.89-2.756-2.584C5.339,3.683,10.084,0,15.255,0z M15.044,24.406 c1.904,0,3.475,1.566,3.475,3.476c0,1.91-1.568,3.476-3.475,3.476c-1.907,0-3.476-1.564-3.476-3.476 C11.568,25.973,13.137,24.406,15.044,24.406z"/>',
            "0 0 32 32"
            );
	};

    var add_min_icon = function(to_element) {
		add_svg(to_element, "input-minimize",
			'<path style="fill:currentColor" d="M465.167,211.613H240.21H26.69c-8.424,0-26.69,11.439-26.69,34.316s18.267,34.316,26.69,34.316h213.52h224.959	c8.421,0,26.689-11.439,26.689-34.316S473.59,211.613,465.167,211.613z"/>',
            "0 0 492 492"
            );
	};

	var console_element = document.createElement("div");
	console_element.className = "simple-console";

	var output = document.createElement("div");
	output.className = "simple-console-output";
	output.setAttribute("role", "log");
	output.setAttribute("aria-live", "polite");

	var input_wrapper = document.createElement("div");
	input_wrapper.className = "simple-console-input-wrapper";
	add_chevron(input_wrapper);

	var input = document.createElement("input");
	input.className = "simple-console-input";
	input.setAttribute("autofocus", "autofocus");
	input.setAttribute("placeholder", placeholder);
	input.setAttribute("aria-label", placeholder);

	console_element.appendChild(output);
	if(!output_only){
		console_element.appendChild(input_wrapper);
	}
    input_wrapper.appendChild(input);
    
    var isMinimized = false;
    var help_button = document.createElement("button");
    var min_button = document.createElement("button");
    help_button.className = "popup-button";
    min_button.className = "popup-button";
	help_button.setAttribute("title", "Help");
	min_button.setAttribute("title", "Minimize");
    add_help_icon(help_button);
    add_min_icon(min_button);
    input_wrapper.appendChild(help_button);
    input_wrapper.appendChild(min_button);
    help_button.addEventListener("click", function() 
    {
        var html = `
		<h3>Made by Timur Vizaev </h3>
		<p></p>
`;
		var vexContent = vex.open( { unsafeContent: html });
    });
    min_button.addEventListener("click", function() 
    {
        var style = isMinimized ? '40%' : '45px';
        var consoleHolder = document.getElementById('consoleHolder').style.maxHeight = style;
        output.scroll_to_bottom();
        isMinimized = !isMinimized;
    });

	var clear = function() {
		output.innerHTML = "";
	};

	var last_entry;
	var get_last_entry = function(){
		return last_entry;
	};

	var log = function(content) {
		// var was_scrolled_to_bottom = output.is_scrolled_to_bottom();

		var entry = document.createElement("div");
		entry.className = "entry";
		if (content instanceof Element) {
			entry.appendChild(content);
		} else {
			entry.innerText = entry.textContent = content;
		}
		output.appendChild(entry);

		requestAnimationFrame(function() {
				output.scroll_to_bottom();
		});

		last_entry = entry;
		return entry;
	};

	var logHTML = function(html) {
		log("");
		get_last_entry().innerHTML = html;
	};

	var error = function(content) {
		log(content);
		get_last_entry().classList.add("error");
	};

	var warn = function(content) {
		log(content);
		get_last_entry().classList.add("warning");
	};

	var info = function(content) {
		log(content);
		get_last_entry().classList.add("info");
	};

	var success = function(content) {
		log(content);
		get_last_entry().classList.add("success");
	};

	output.is_scrolled_to_bottom = function() {
		// 1px margin of error needed in case the user is zoomed in
		return output.scrollTop + output.clientHeight + 1 >= output.scrollHeight;
	};

	output.scroll_to_bottom = function() {
		output.scrollTop = output.scrollHeight;
	};

	var command_history = [];
	var command_index = command_history.length;
	var command_history_key = storage_id + " command history";

	// var load_command_history = function() {
	// 	try {
	// 		command_history = JSON.parse(localStorage[command_history_key]);
	// 		command_index = command_history.length;
	// 	} catch (e) {}
	// };

	// var save_command_history = function() {
	// 	try {
	// 		localStorage[command_history_key] = JSON.stringify(command_history);
	// 	} catch (e) {}
	// };

	// var clear_command_history = function() {
	// 	command_history = [];
	// 	save_command_history();
	// };

	// load_command_history();

	input.addEventListener("keydown", function(e) {
		if (e.keyCode === 13) { // Enter

			var command = input.value;
			if (command === "") {
				return;
			}
			input.value = "";

			if (command_history[command_history.length - 1] !== command) {
				command_history.push(command);
			}
			command_index = command_history.length;
			// save_command_history();

			var command_entry = log(command);
			command_entry.classList.add("input");
			add_chevron(command_entry);

			output.scroll_to_bottom();

			handle_command(command);

		} else if (e.keyCode === 38) { // Up
			
			if (--command_index < 0) {
				command_index = -1;
				input.value = "";
			} else {
				input.value = command_history[command_index];
			}
			input.setSelectionRange(input.value.length, input.value.length);
			e.preventDefault();
			
		} else if (e.keyCode === 40) { // Down
			
			if (++command_index >= command_history.length) {
				command_index = command_history.length;
				input.value = "";
			} else {
				input.value = command_history[command_index];
			}
			input.setSelectionRange(input.value.length, input.value.length);
			e.preventDefault();
			
		} else if (e.keyCode === 46 && e.shiftKey) { // Shift+Delete
			
			if (input.value === command_history[command_index]) {
				command_history.splice(command_index, 1);
				command_index = Math.max(0, command_index - 1)
				input.value = command_history[command_index] || "";
				// save_command_history();
			}
			e.preventDefault();
			
		}
	});

	this.element = console_element;
	this.input = input;

	this.handleUncaughtErrors = function() {
		window.onerror = error;
	};

	this.log = log;
	this.logHTML = logHTML;
	this.error = error;
	this.warn = warn;
	this.info = info;
	this.success = success;
	this.getLastEntry = get_last_entry;
	this.clear = clear;

};

