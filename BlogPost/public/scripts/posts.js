(function () {
    'use strict';

    const addCommentGUI = $(`<div>
                                <textarea id="commentContent"></textarea>
                                <button id="addComment">add</button>
                                <button id="cancelComment">cancel</button>
                           </div>`),
        commentContent = addCommentGUI.find('#commentContent'),
        postsDiv = $('.posts');


    $(document).on('click', '.showComments', e => {
        const theTarget = $(e.target);
        console.log('hi', $(e.target).closest('.post').attr('id'));
        $.get('/comments', { postId: $(e.target).closest('.post').attr('id') }, comments => {
            theTarget.next().append(comments).show();
            $('.post').append('<button class="addComment">add comment</button>');
            theTarget.hide();

        }).always(() => {
            $('.addComment').show();
        })

    });
    $(document).on('click', '.addComment', e => {
        const theTarget = $(e.target);
        theTarget.after(addCommentGUI);
        addCommentGUI.show();
        theTarget.hide();
    });

    function hideAddCommentGUI() {
        addCommentGUI.hide();
        $('#commentContent').val('');
        $('.addComment').show();
    }

    $(document).on('click', '#addComment', e => {
        $.post('/addComment', {
            _id: $(e.target).closest('.post').attr('id'),
            content: $('#commentContent').val()
        });
        hideAddCommentGUI();
    });

    $(document).on('click', '#cancelComment', e => {
        hideAddCommentGUI();
    });

    io().on('comment', data => {
        console.log(data.comment);
        $('#' + data.post).find('.comments').append(data.comment);
    });
}());