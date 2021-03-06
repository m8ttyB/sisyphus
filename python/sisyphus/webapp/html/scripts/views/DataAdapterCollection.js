var DataAdapterCollection = new Class({
   /****************************
    * DataAdapterCollection holds an associative array
    * of BHViewAdapter classes.  These adapter classes enable
    * individual bhviews to deliver idiosyncratic behavior that
    * is unique to the data that they deliver.  Callers call
    * getAdapter('adapter_name') to retrieve a specific bhview adapter.
    * **************************/

   Extends:Options,

   jQuery:'BHViewAdapterCollection',

   initialize: function(selector, options){

      this.setOptions(options);

      //Holds a list of adapters.  The key should be found in
      //views.json in the data_adapter attribute.
      this.adapters = { 'named_fields':new BHViewAdapter(),
                        'crashes':new CrashesAdapter(),
                        'urls':new UrlAdapter(),
                        'all_resubmission_urls': new AllResubmissionUrlsAdapter(),
                        'resubmission_urls': new ResubmissionUrlsAdapter() };

   },

   getAdapter: function(adapter){

      if(this.adapters[adapter] === undefined){
         this.adapters['named_fields'].adapter = adapter;
         return this.adapters['named_fields'];
      }else{
         this.adapters[adapter].adapter = adapter;
         return this.adapters[adapter];
      }
   }
});
var BHViewAdapter = new Class({
   /**************************
    * The BHViewAdapter provides functionality for managing 
    * the generic bhview.  The public interface includes all
    * bhview functionality that might need to be specialized.
    * New types of bhviews can inherit from BHViewAdapter and
    * override the public interface where necessary.
    *
    *     Public Interface
    *     ----------------
    *     setControlPanelFields()
    *     processControlPanel()
    *     clearPanel()
    *     getDefaultParams()
    *     processData()
    *     processPanelClick()
    *     setSelectionRange()
    *
    **************************/
   Extends:Options,

   jQuery:'BHViewAdapter',

   initialize: function(selector, options){

      this.setOptions(options);

      this.crashStatsUrlBase = "https://crash-stats.mozilla.com/report/index/";
      this.hgUrlBase = "http://hg.mozilla.org/mozilla-central/rev/";

      //Name of the adapter, set by getAdapter()
      this.adapter = "";
      //Set's the default column to sort on
      this.sorting = { 'named_fields':[[0, 'desc']] };

      // Maps column name to formatter function ref
      //
      //This might eventually need to be split out into 
      //the derived classes that possess the tables.
      this.formatColumnMap = { crashreport:_.bind(this._mediaColumnFormatter, this),
                               log:_.bind(this._mediaColumnFormatter, this),
                               steps:_.bind(this._escapeColumnFormatter, this),
                               changeset:_.bind(this._externalLinkFormatter, this),
                               uuid:_.bind(this._externalLinkFormatter, this),
                               steps:_.bind(this._preTagFormatter, this),
                               stack:_.bind(this._preTagFormatter, this),
                               exploitability:_.bind(this._exploitabilityCounter, this) };


      this.mediaColumns = { crashreport:true,
                            log:true };
                           
      this.escapeColumns = { url:true,
                             steps:true };

      this.externalLinkColumns = { changeset:true };

      this.preTagColumns = { steps:true, stack:true };

      this.cpStartDateName = 'start_date';
      this.cpEndDateName = 'end_date';

      this.startDateSel = '#bh_start_date';
      this.endDateSel = '#bh_end_date';
      this.currentDateSel = '#bh_current_date';

      this.ignoreKeyCodes = { 37:1,    //left arrow
                              39:1 };  //right arrow
   },
   setControlPanelFields: function(controlPanelDropdownEl, data){
      /*********************
       * Sets the values of the input fields in the control panel.  These 
       * fields may need to be pre-loaded with default values or the data 
       * from a particular signal.
       *
       * Parameters:
       *   
       *    controlPanelDropdownEl - The control panel DOM element
       *
       *    data - signal data object
       *             data.signal - name of signal
       *             data.data - signal data
       * *******************/
      if(!_.isEmpty(data)){
         //this.clearPanel(controlPanelDropdownEl);
         var el = $(controlPanelDropdownEl).find('[name="' + data.signal + '"]');
         $(el).attr('value', BHPAGE.unescapeForUrl(data.data));

         if(!_.isEmpty(data.date_range)){
            var startInput = $(controlPanelDropdownEl).find('[name="start_date"]');
            startInput.attr('value',  data.date_range.start_date );
            var endInput = $(controlPanelDropdownEl).find('[name="end_date"]');
            endInput.attr('value', data.date_range.end_date );
         }

      }else {

         var startInput = $(controlPanelDropdownEl).find('[name="start_date"]');
         var endInput = $(controlPanelDropdownEl).find('[name="end_date"]');

         //Only set the values to the default date range if both values
         //are undefined
         if( !startInput.val() && !endInput.val() ){ 
            startInput.attr('value',  $(this.startDateSel).val() );
            endInput.attr('value', $(this.endDateSel).val() );
         }
      }
   },
   processControlPanel: function(controlPanelSel, data){
      /*************************
       * Translate the values of the control panel fields 
       * or signal data into a URL parameter string.
       *
       * Parameters:
       *    
       *    controlPanelSel - Control panel id selector
       *    data - signal data object
       *       data.signal - name of signal
       *       data.data - signal data
       **************************/
      var params = "";

      if(!_.isEmpty(data)){
         if(!_.isEmpty(data.date_range)){
            params = 'start_date=' + data.date_range.start_date + 
                     '&end_date=' + data.date_range.end_date + '&' + 
                     data.signal + '=' + data.data; 
         }else{
            params = data.signal + '=' + data.data; 
         }
      }else{

         var inputs = $(controlPanelSel).find('input');

         for(var i=0; i<inputs.length; i++){
            var type = $(inputs[i]).attr('type');
            if((type == 'text') || (type == 'checkbox') || (type == 'hidden')){
               var name = $(inputs[i]).attr('name');
               var v = $(inputs[i]).val();
               if(v != undefined){
                  v = v.replace(/\s+$/, '');
               }
               if(!(v === "")){
                  params += name + '=' + BHPAGE.escapeForUrl(v) + '&';
               }
            }
         }
         var textareas = $(controlPanelSel).find('textarea');
         for(var i=0; i<textareas.length; i++){
            var name = $(textareas[i]).attr('name');
            var v = $(textareas[i]).val();
            if(!(v === "")){
               params += name + '=' + BHPAGE.escapeForUrl(v) + '&';
            }
         }
         params = params.replace(/\&$/, '');
      }

      if(params == ""){
         //If params is still an empty string it's possible processControlPanel
         //was called before the control panel was created.  Get the date range
         var dateRange = this.getDateRangeParams(controlPanelSel, data);
         params = "start_date=" + dateRange.start_date + "&end_date=" + dateRange.end_date;
      }

      return params;
   },
   getDateRangeParams: function(controlPanelDropdownEl, signalData){

      var start = "";
      var end = "";

      //Ugh, this a bit hideous
      if(($(controlPanelDropdownEl)[0] === undefined) && (signalData === undefined)){
         //Menu has not been created take date range out of page
         start = $(this.startDateSel).val();
         end = $(this.endDateSel).val();
      }else{
         //Menu has been created already
         var startInput = $(controlPanelDropdownEl).find('[name="start_date"]');
         start = startInput.val();
         if(start != undefined){
            start = start.replace(/\s+$/, '');
         }
         var endInput = $(controlPanelDropdownEl).find('[name="end_date"]');
         end = endInput.val();
         if(end != undefined){
            end = end.replace(/\s+$/, '');
         }

         //signal data exists but the menu has not been created, could occur on refresh
         //or navigating to another view
         if( ((start === undefined) && (end === undefined)) && (signalData['date_range'] != undefined)){
            return signalData['date_range'];
         }
      }

      return { start_date:start, end_date:end };
   },
   clearPanel: function(controlPanelSel){
      /*******************
       * Clear all of the input fields in the control panel.
       *
       * Parameters:
       *    controlPanelSel - Control panel id selector
       ********************/
      var inputs = $(controlPanelSel).find('input');
      var textareas = $(controlPanelSel).find('textarea');
      for(var i=0; i<inputs.length; i++){
         $(inputs[i]).attr('value', '');
      }
      for(var i=0; i<textareas.length; i++){
         $(textareas[i]).attr('value', '');
      }
   },
   getDefaultParams: function(){
      /******************
       * Build the default URL parameter string.  In this case
       * use the date range embedded in the page.
       * ****************/
      var params = 'start_date=' + $(this.startDateSel).val() +
                   '&end_date=' + $(this.endDateSel).val();
      return params;
   },
   resetDates: function(controlPanelDropdownEl){

      //Reset the start and end date to the values embedded
      //in the page.
      var startInput = $(controlPanelDropdownEl).find('[name="start_date"]');
      startInput.attr('value', $(this.startDateSel).val());

      var endInput = $(controlPanelDropdownEl).find('[name="end_date"]');
      endInput.attr('value', $(this.endDateSel).val());
   },
   checkDates: function(controlPanelDropdownEl, 
                        showMessage, 
                        serverStartDate, 
                        serverEndDate, 
                        serverResetSel,
                        badDateSel){

      this.serverResetSel = serverResetSel;
      this.badDateSel = badDateSel;

      var startInput = $(controlPanelDropdownEl).find('[name="start_date"]');
      var endInput = $(controlPanelDropdownEl).find('[name="end_date"]');

      //Check if the server reset the date range 
      if( showMessage ){
         //update panel values
         startInput.attr('value', serverStartDate);
         endInput.attr('value', serverEndDate);
         //display message
         $(this.serverResetSel).removeClass('hidden');
      }else{
         $(this.serverResetSel).addClass('hidden');
         $(this.badDateSel).addClass('hidden');
      }

      //Set up date format listeners
      startInput.keyup( _.bind(this.validateDate, this ) );
      endInput.keyup( _.bind(this.validateDate, this) );
   },
   unbindPanel: function(controlPanelDropdownEl){
      var startInput = $(controlPanelDropdownEl).find('[name="start_date"]');
      var endInput = $(controlPanelDropdownEl).find('[name="end_date"]');
      startInput.unbind();
      endInput.unbind();
   },
   validateDate: function(event){

      var dt = $(event.target).val();

      var carretPos = event.target.selectionStart -1;

      //Let the user use the backspace anywhere
      //in the string
      if(this.ignoreKeyCodes[event.keyCode]){
         return;
      }
      if( dt.match(/[^\d\-\:\s/]/) ){
         //Don't allow bad chars
         $(event.target).attr('value', dt.replace(/[^\d\-\:\s/]/, '') );
         return;
      }
      //collapse multiple spaces to one
      if( dt.match(/\s\s/g) ){
         $(event.target).attr('value', dt.replace(/\s\s/, ' ') );
         return;
      }
      //Let the user know when they have a bad date
      if( dt.match(/^\d\d\d\d\-\d\d\-\d\d\s\d\d\:\d\d\:\d\d$|^\d\d\d\d\-\d\d\-\d\d\s{0,}$/) ){
         $(this.badDateSel).addClass('hidden');
      }else{
         $(this.badDateSel).removeClass('hidden');
         $(this.serverResetSel).addClass('hidden');
      }
   },
   processData: function(dataObject, datatableObject, signals){

      /****************************
       * Carry out any data processing unique to the bhview.
       *
       * Parameters:
       *    dataObject - Deserialized json from server.
       *    datatableObject - datatable.js object
       *    signals - Associative array of signals that the bhview
       *              can receive/send
       * ***************************/

      //exploitabilityCounts is only used by _exploitabilityCounter to 
      //count the 3 different types of exploitability states and return
      //them to the caller
      var exploitabilityCounts = { "low":0, "medium":0, "high":0 };

      if(dataObject.data.length >= 1 ){

         if(this.sorting[ this.adapter ]){
            datatableObject.aaSorting = this.sorting[this.adapter];
         }

         //Build column names for datatables.js
         for(i=0; i<dataObject['columns'].length; i++){
            var colName = dataObject['columns'][i];
            datatableObject.aoColumns.push({ "mDataProp":colName, "sTitle":colName });
         }

         for(var i=0; i<dataObject.data.length; i++){
            //Trying to avoid iterating over all columns here, some tables
            //have lots of columns that don't require any special formatting.
            //To account for this, formatter functions iterate over the limited
            //set of columns that need formatting.
            for( var formatCol in this.formatColumnMap ){
               if(dataObject.data[i][formatCol] != undefined){
                  this.formatColumnMap[formatCol](i, formatCol, dataObject, exploitabilityCounts);
               }
            }
            //Handling signal columns separately so we don't have to
            //hardcode the signals and map them to a specific handler function
            this._signalColumnFormatter(i, signals, dataObject);
         }
      }

      return exploitabilityCounts;
   },
   processPanelClick: function(elId, bhviewIndex){
      return;
   },
   setSelectionRange: function(input, selectionStart, selectionEnd){

      if(input.setSelectionRange){
         input.focus();
         input.setSelectionRange(selectionStart, selectionEnd);
      }else if(input.createTextRange){
         var range = input.createTextRange();
         range.collapse(true);
         range.moveEnd('character', selectionEnd);
         range.moveStart('character', selectionStart);
         range.select();
      }
   },
   _preTagFormatter: function(i, col, dataObject){
      dataObject.data[i][col] = '<pre>' + dataObject.data[i][col] + '</pre>';
   },
   _externalLinkFormatter: function(i, col, dataObject){
      var urlBase = "";
      if(col == 'uuid'){
         urlBase = this.crashStatsUrlBase;
      }else if(col == 'changeset'){
         urlBase = this.hgUrlBase;
      }
      dataObject.data[i][col] = '<a target="_blank" href="' + urlBase +
                                   dataObject.data[i][col] + '">' + dataObject.data[i][col] + '</a>';
   },
   _escapeColumnFormatter: function(i, col, dataObject){
      if(dataObject.data[i][col] != undefined){
         dataObject.data[i][col] = BHPAGE.escapeHtmlEntities(dataObject.data[i][col]);
      }
   },
   _mediaColumnFormatter: function(i, col, dataObject){
      if(dataObject.data[i][col] != undefined){
         var mediaHref = "/bughunter/media" + 
         dataObject.data[i][col].replace(/^.*media/, '').replace(/\.gz$/, '');
         dataObject.data[i][col] = '<a target="_blank" href="' + mediaHref + '">view</a>';
      }
   },
   _exploitabilityCounter: function(i, col, dataObject, exploitabilityCounts){
      if( dataObject.data[i][col] && 
          (exploitabilityCounts[ dataObject.data[i][col] ] || exploitabilityCounts[ dataObject.data[i][col] ] === 0 )){
         exploitabilityCounts[ dataObject.data[i][col] ]++;
      }
   },
   _signalColumnFormatter: function(i, signals, dataObject){
      for(var s in signals){
         var eclass = 'bh-signal-' + s;
         if(dataObject.data[i][s] != undefined){

            if(s == 'socorro_id'){
               dataObject.data[i][s] = '<div style="display:inline;"><a class="' + eclass + 
                                       '" href="#' + s + '">' + 
                                       BHPAGE.escapeHtmlEntities(String(dataObject.data[i][s])) + 
                                       '</a></div>';
            }else{
               var cmenu = "bh_table_contextmenu";
               if(s == 'url'){
                  cmenu = "bh_url_contextmenu";
               }else if(s == 'fatal_message'){
                  cmenu = "bh_fm_contextmenu";
               }
               dataObject.data[i][s] = '<div contextmenu="' + cmenu + 
                                       '" style="display:inline;"><a class="' + eclass + 
                                       '" href="#' + s + 
                                       '">' + BHPAGE.escapeHtmlEntities(dataObject.data[i][s]) + 
                                       '</a></div>';
            }
         }
      }
   }
});
var CrashesAdapter = new Class({

   Extends:BHViewAdapter,

   jQuery:'CrashesAdapter',

   initialize: function(selector, options){
      this.setOptions(options);
      this.parent(options);

      //Set default sort column to Total Count
      this.sorting = { 'crashes':[[2, 'desc']] };

      this.newSignaturesId = 'bh_new_signatures_c';
   },
   processPanelClick: function(elId, bhviewIndex){
      if(elId === undefined){
         return;
      }
      if(elId.match(this.newSignaturesId)){
         var el = $('#' + elId);
         var value = $(el).attr('value');
         if(value == 'on'){
            $(el).attr('value', 'off');
         }else{
            $(el).attr('value', 'on');
         }
      }
   },
   getDefaultParams: function(){
      /******************
       * Build the default URL parameter string.  In this case
       * use the date range embedded in the page.
       * ****************/
      var params = 'start_date=' + $(this.startDateSel).val() +
                   '&end_date=' + $(this.endDateSel).val() +
                   '&new_signatures=on';
      return params;
   }
});

var UrlAdapter = new Class({

   Extends:BHViewAdapter,

   jQuery:'UrlAdapter',

   initialize: function(selector, options){
      this.setOptions(options);
      this.parent(options);

      //Set default sort column to Total Count
      this.sorting = { 'urls':[[1, 'desc']] };
   }
});

var ResubmissionUrlsAdapter = new Class({

   Extends:BHViewAdapter,

   jQuery:'ResubmissionUrlsAdapter',

   initialize: function(selector, options){
      this.setOptions(options);
      this.parent(options);

      this.resubmissionId = 'bh_cp_url_resubmission_c';
      this.urlResubmissionTextarea = 'url-resubmission';
      this.urlResubmissionSignature = 'url-resubmission-comments';

      this.allViewsContainerSel = '#bh_view_container';

      this.urlResubmissionEvent = 'URL_RESUBMISSION';

      //Set default sort column to Total Count
      this.sorting = { 'resubmission_urls':[[0, 'desc']] };
   },
   processPanelClick: function(elId, bhviewIndex){
      if(elId && elId.match(this.resubmissionId)){

         var urlEl = $('[name="' + this.urlResubmissionTextarea + '"]');
         var rawUrls = $(urlEl).val();
         var urlsSplit = rawUrls.split(/\n/);
         var urls = [];
         for(var i=0; i<urlsSplit.length; i++){
            if(urlsSplit[i] != ""){
               urls.push(urlsSplit[i]);
            }
         }

         var sigEl = $('[name="' + this.urlResubmissionSignature + '"]');
         var signature = $(sigEl).val();

         if(urls.length > 0){

            var data = { urls:urls, 
                         bhview_index:bhviewIndex,
                         signature:signature,
                         callback:_.bind( function(){
                         
                           //Clear the url resubmission fields
                           $('[name="' + this.urlResubmissionTextarea + '"]').val("");
                           $('[name="' + this.urlResubmissionSignature + '"]').val("");
                         
                         }, this) };
            $(this.allViewsContainerSel).trigger(this.urlResubmissionEvent, data);

         }else{
            alert('Hey I need some URLs to do that.  Add some URLs to the textarea labeld "Enter URLs".  Thanks!');
         }
      }
      return;
   },
   setControlPanelFields: function(controlPanelDropdownEl, data){

      var textareaSel = '[name="' + this.urlResubmissionTextarea + '"],[name="' + 
                        this.urlResubmissionSignature + '"]';

      $(textareaSel).bind('keydown', function(event){
         if(event.keyCode == 13){
            //Let the user add a newline to the textareas
            event.stopPropagation();
         }
      });

      if(!_.isEmpty(data)){
         var el = $(controlPanelDropdownEl).find('[name="' + data.signal + '"]');
         $(el).attr('value', BHPAGE.unescapeForUrl(data.data));

         if(!_.isEmpty(data.date_range)){
            var startInput = $(controlPanelDropdownEl).find('[name="start_date"]');
            startInput.attr('value',  data.date_range.start_date );
            var endInput = $(controlPanelDropdownEl).find('[name="end_date"]');
            endInput.attr('value', data.date_range.end_date );
         }

      }else {

         var startInput = $(controlPanelDropdownEl).find('[name="start_date"]');
         var endInput = $(controlPanelDropdownEl).find('[name="end_date"]');

         //Only set the values to the default date range if both values
         //are undefined
         if( !startInput.val() && !endInput.val() ){ 
            startInput.attr('value',  $(this.startDateSel).val() );
            endInput.attr('value', $(this.endDateSel).val() );
         }
      }
   }
});

var AllResubmissionUrlsAdapter = new Class({

   Extends:ResubmissionUrlsAdapter,

   jQuery:'AllResubmissionUrlsAdapter',

   initialize: function(selector, options){

      this.setOptions(options);
      this.parent(options);

      //Set default sort column to Total Count
      this.sorting = { 'all_resubmission_urls':[[1, 'desc']] };
   }
});

