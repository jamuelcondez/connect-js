/**
 * Copyright Facebook Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @provides fb.xfbml
 * @layer xfbml
 * @requires fb.prelude fb.loader
 */

/**
 * Methods for the rendering of [[wiki:XFBML]] tags.
 *
 * To render the tags, simple use them anywhere in your page,
 * and then call:
 *
 *      FB.XFBML.parse();
 *
 * @class FB.XFBML
 * @static
 */
FB.provide('XFBML', {
  /**
   * The time allowed for all tags to finish rendering.
   *
   * @type Number
   */
  _renderTimeout: 30000,

  /**
   * Dynamically set XFBML markup on a given DOM element. Use this
   * method if you want to set XFBML after the page has already loaded
   * (for example, in response to an Ajax request or API call).
   *
   * Example:
   * --------
   * Set the innerHTML of a dom element with id "container"
   * to some markup (fb:name + regular HTML) and render it
   *
   *      FB.XFBML.set(FB.$('container'),
   *          '<fb:name uid="4"></fb:name><div>Hello</div>');
   *
   * @param {DOMElement} dom  DOM element
   * @param {String} markup XFBML markup. It may contain reguarl
   *         HTML markup as well.
   */
  set: function(dom, markup, cb) {
    dom.innerHTML = markup;
    FB.XFBML.parse(dom, cb);
  },

  /**
   * Parse and render XFBML markup in the document.
   *
   * Examples
   * --------
   *
   * By default, this is all you need to make XFBML work:
   *
   *       FB.XFBML.parse();
   *
   * Alternately, you may want to only evaluate a portion of
   * the document. In that case, you can pass in the elment.
   *
   *       FB.XFBML.parse(document.getElementById('foo'));
   *
   * @access public
   * @param dom {DOMElement} (optional) root DOM node, defaults to body
   * @param cb {Function} (optional) invoked when elements are rendered
   */
  parse: function(dom, cb) {
    dom = dom || document.body;

    // We register this function on each tag's "render" event. This allows us
    // to invoke the callback when we're done rendering all the found elements.
    //
    // We start with count=1 rather than 0, and finally call onTagDone() after
    // we've kicked off all the tag processing. This ensures that we do not hit
    // count=0 before we're actually done queuing up all the tags.
    var
      count = 1,
      onTagDone = function() {
        count--;
        if (count === 0) {
          // Invoke the user specified callback for this specific parse() run.
          cb && cb();

          // Also fire a global event. A global event is fired for each
          // invocation to FB.XFBML.parse().
          FB.Event.fire('xfbml.render');
        }
      };

    // First, find all tags that are present
    FB.forEach(FB.XFBML._tagInfos, function(tagInfo) {
      // default the xmlns if needed
      if (!tagInfo.xmlns) {
        tagInfo.xmlns = 'fb';
      }

      var xfbmlDoms = FB.XFBML._getDomElements(
        dom,
        tagInfo.xmlns,
        tagInfo.localName
      );
      for (var i=0; i < xfbmlDoms.length; i++) {
        count++;
        FB.XFBML._processElement(xfbmlDoms[i], tagInfo, onTagDone);
      }
    });

    // Setup a timer to ensure all tags render within a given timeout
    var timeout = window.setTimeout(function() {
      if (count > 0) {
        FB.log(
          count + ' XFBML tags failed to render in ' +
          FB.XFBML._renderTimeout + 'ms.'
        );
      }
    }, FB.XFBML._renderTimeout);
    // Call once to handle count=1 as described above.
    onTagDone();
  },

  /**
   * Register a custom XFBML tag. If you create an custom XFBML tag, you can
   * use this method to register it so the it can be treated like
   * any build-in XFBML tags.
   *
   * Example
   * -------
   *
   * Register fb:name tag that is implemented by class FB.XFBML.Name
   *       tagInfo = {xmlns: 'fb',
   *                  localName: 'name',
   *                  className: 'FB.XFBML.Name'},
   *       FB.XFBML.registerTag(tagInfo);
   *
   * @param {Object} tagInfo
   * an object containiner the following keys:
   * - xmlns
   * - localName
   * - className
   */
  registerTag: function(tagInfo) {
    FB.XFBML._tagInfos.push(tagInfo);
  },


  //////////////// Private methods ////////////////////////////////////////////

  /**
   * Process an XFBML element.
   *
   * @access private
   * @param dom {DOMElement} the dom node
   * @param tagInfo {Object} the tag information
   * @param cb {Function} the function to bind to the "render" event for the tag
   */
  _processElement: function(dom, tagInfo, cb) {
    // Check if element for the dom already exists
    var element = dom._element;
    if (element) {
      element.subscribe('render', cb);
      element.process();
    } else {
      var processor = function() {
        var fn = eval(tagInfo.className);
        element = dom._element = new fn(dom);
        element.subscribe('render', cb);
        element.process();
      };

      if (FB.CLASSES[tagInfo.className.substr(3)]) {
        processor();
      } else {
        // Load on-demand if necessary. Component name is lower case className.
        var component = tagInfo.className.toLowerCase();
        FB.Loader.use(component, processor);
      }
    }
  },

  /**
   * Get all the DOM elements present under a given node with a given tag name.
   *
   * @access private
   * @param dom {DOMElement} the root DOM node
   * @param xmlns {String} the XML namespace
   * @param localName {String} the unqualified tag name
   * @return {DOMElementCollection}
   */
  _getDomElements: function(dom, xmlns, localName) {
    // Different browsers behave slightly differently in handling tags
    // with custom namespace.
    var fullName = xmlns + ':' + localName;

    switch (FB.Dom.getBrowserType()) {
    case 'mozilla':
      // Use document.body.namespaceURI as first parameter per
      // suggestion by Firefox developers.
      // See https://bugzilla.mozilla.org/show_bug.cgi?id=531662
      return dom.getElementsByTagNameNS(document.body.namespaceURI, fullName);
    case 'ie':
      var docNamespaces = document.namespaces;
      if (docNamespaces && docNamespaces[xmlns]) {
        return dom.getElementsByTagName(localName);
      } else {
        // It seems that developer tends to forget to declare the fb namespace
        // in the HTML tag (xmlns:fb="http://www.facebook.com/2008/fbml") IE
        // has a stricter implementation for custom tags. If namespace is
        // missing, custom DOM dom does not appears to be fully functional. For
        // example, setting innerHTML on it will fail.
        //
        // If a namespace is not declared, we can still find the element using
        // GetElementssByTagName with namespace appended.
        return dom.getElementsByTagName(fullName);
      }
    default:
      return dom.getElementsByTagName(fullName);
    }
  },

  /**
   * Register the default set of base tags. Each entry must have a localName
   * and a className property, and can optionally have a xmlns property which
   * if missing defaults to 'fb'.
   *
   * NOTE: Keep the list alpha sorted.
   */
  _tagInfos: [
    { localName: 'add-to-wishlist', className: 'FB.XFBML.AddToWishList' },
    { localName: 'comments',        className: 'FB.XFBML.Comments' },
    { localName: 'fan',             className: 'FB.XFBML.Fan' },
    { localName: 'like',            className: 'FB.XFBML.Like' },
    { localName: 'live-stream',     className: 'FB.XFBML.LiveStream' },
    { localName: 'login-button',    className: 'FB.XFBML.LoginButton' },
    { localName: 'name',            className: 'FB.XFBML.Name' },
    { localName: 'profile-pic',     className: 'FB.XFBML.ProfilePic' },
    { localName: 'serverfbml',      className: 'FB.XFBML.ServerFbml' },
    { localName: 'share-button',    className: 'FB.XFBML.ShareButton' }
  ]
});

/*
 * For IE, we will try to detect if document.namespaces contains 'fb' already
 * and add it if it does not exist.
 */
if (document.namespaces && !document.namespaces.item.fb) {
   document.namespaces.add('fb');
}
